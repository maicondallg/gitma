"""Exercise the bundled Linux application through tauri-driver (no browser mocks)."""
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "target/visual"
OUTPUT.mkdir(parents=True, exist_ok=True)
DRIVER = os.environ.get("TAURI_DRIVER", str(Path.home() / ".cargo/bin/tauri-driver"))
WEBKIT = os.environ.get("WEBKIT_WEBDRIVER", str(ROOT / "target/tools/usr/bin/WebKitWebDriver"))
BINARY = os.environ.get("GITMA_BINARY", str(ROOT / "target/release/gitma-desktop"))


def request(method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request("http://127.0.0.1:4444" + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as response:
        result = json.load(response)
    value = result.get("value")
    if isinstance(value, dict) and "error" in value:
        raise RuntimeError(value)
    return value


def wait_for(check, label, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            result = check()
            if result:
                return result
        except (OSError, RuntimeError):
            pass
        time.sleep(0.2)
    raise AssertionError("Timeout: " + label)


def git(root, *args):
    return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True).stdout


env = {**os.environ, "TAURI_WEBVIEW_AUTOMATION": "true"}
log = (OUTPUT / "native-driver.log").open("w")
driver = subprocess.Popen([DRIVER, "--native-driver", WEBKIT], env=env, stdout=log, stderr=log)
session_id = None
try:
    wait_for(lambda: request("GET", "/status"), "WebDriver startup")
    with tempfile.TemporaryDirectory(prefix="Gitma-native-") as temp:
        repo = Path(temp)
        git(repo, "init", "-q")
        git(repo, "config", "user.name", "Gitma Native Test")
        git(repo, "config", "user.email", "test@example.invalid")
        source = repo / "file.ts"
        source.write_text("export const answer = 41;\n")
        git(repo, "add", "file.ts")
        git(repo, "commit", "-qm", "Initial native smoke commit")
        git(repo, "checkout", "-b", "feat/probabilidade-taxonomia")
        source.write_text("export const answer = 42;\nexport const ready = true;\n")
        (repo / "notes.md").write_text("Native smoke test\n")
        session = request("POST", "/session", {"capabilities": {"alwaysMatch": {"tauri:options": {"application": BINARY, "args": ["--repo", str(repo)]}}}})
        session_id = session["sessionId"]
        prefix = "/session/" + session_id

        def execute(script, *args):
            return request("POST", prefix + "/execute/sync", {"script": script, "args": list(args)})

        def text():
            return execute("return document.body.innerText")

        def click(selector):
            return wait_for(lambda: execute("const node=document.querySelector(arguments[0]); if(!node || node.disabled)return false; node.click(); return true;", selector), selector)


        def capture(name):
            image = request("GET", prefix + "/screenshot")
            (OUTPUT / name).write_bytes(base64.b64decode(image))

        wait_for(lambda: "Initial native smoke commit" in text(), "real history")
        click('button[title^="file.ts"]')
        wait_for(lambda: "answer" in text(), "Monaco text from Rust preview")
        capture("native-local.png")
        print("Native repository and Monaco loaded", flush=True)

        execute("""
          window.__GitmaCalls=[];
          window.__GitmaEvents=[];
          window.__TAURI_INTERNALS__.invoke('plugin:event|listen',{event:'repo-changed',target:{kind:'Any'},handler:window.__TAURI_INTERNALS__.transformCallback(event=>window.__GitmaEvents.push(event))});
          const invoke=(cmd,args)=>{window.__GitmaCalls.push(cmd);return window.__TAURI_INTERNALS__.invoke(cmd,args)};
          window.__Gitma_BRIDGE__={
            getSnapshot:(sessionId,requestId)=>invoke('get_snapshot',{sessionId,requestId}),
            getHistory:(sessionId,requestId,page)=>invoke('get_history',{sessionId,requestId,page}),
            getCommitFiles:(sessionId,requestId,oid)=>invoke('get_commit_files',{sessionId,requestId,oid}),
            getFilePreview:(sessionId,requestId,fileId)=>invoke('get_file_preview',{sessionId,requestId,fileId}),
            applyOperation:(sessionId,requestId,operation,fileIds,message)=>invoke('apply_operation',{sessionId,requestId,operation,fileIds,message})
          };
        """)
        index_mtime = (repo / ".git/index").stat().st_mtime_ns
        click('button[title*="Ctrl+R"]')
        wait_for(lambda: execute("return window.__GitmaCalls.includes('get_snapshot')"), "manual refresh")
        time.sleep(4)
        calls = execute("return window.__GitmaCalls.length")
        for _ in range(2):
            time.sleep(5)
            assert execute("return window.__GitmaCalls.length") == calls, "refresh triggered further Git reads while idle: " + json.dumps(execute("return {calls:window.__GitmaCalls,events:window.__GitmaEvents}"))
            assert "answer" in text(), "diff disappeared after refresh"
            print("Native idle refresh remained stable", flush=True)
        assert (repo / ".git/index").stat().st_mtime_ns == index_mtime, "background reads rewrote the index"

        source.write_text("export const answer = 43;\nexport const externalEdit = true;\n")
        wait_for(lambda: "externalEdit" in text(), "watcher updates selected file without changing its Git status")
        source.write_text("export const answer = 41;\n")
        wait_for(lambda: execute('return document.querySelector(\'button[title^="file.ts"]\') === null'), "watcher removes restored clean file")
        source.write_text("export const answer = 43;\nexport const externalEdit = true;\n")
        wait_for(lambda: execute('return document.querySelector(\'button[title^="file.ts"]\') !== null'), "watcher detects a new tracked change")
        click('button[title^="file.ts"]')
        wait_for(lambda: "externalEdit" in text(), "reselected edited preview")

        click('input[aria-label="file.ts: colocar no stage"]')
        wait_for(lambda: "Em stage" in text() and "file.ts" in git(repo, "diff", "--cached", "--name-only"), "stage")
        execute("const input=document.querySelector('#commit-message'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(input,'Native smoke commit');input.dispatchEvent(new Event('input',{bubbles:true}));")
        wait_for(lambda: execute("return !document.querySelector('button[type=submit]').disabled"), "commit validation")
        click('button[type="submit"]')
        wait_for(lambda: git(repo, "log", "-1", "--format=%s").strip() == "Native smoke commit", "commit writes to Git")
        wait_for(lambda: execute("return document.querySelector('#commit-message').value === ''"), "successful commit clears message")

        # Testa menu de contexto no botão de Push (com botão direito)
        execute("""
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Push');
            if (btn) {
                const rect = btn.getBoundingClientRect();
                btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.x + 10, clientY: rect.y + 30 }));
            }
        """)
        wait_for(lambda: execute("return !!document.querySelector('.push-context-menu')"), "push context menu")
        time.sleep(0.5)
        capture("native-push-menu.png")
        execute("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));")
        wait_for(lambda: execute("return !document.querySelector('.push-context-menu')"), "push menu closed")

        # Testa Amend no formulário de commit
        source.write_text("export const answer = 99;\n")
        wait_for(lambda: execute('return document.querySelector(\'button[title^="file.ts"]\') !== null'), "watcher detects file.ts")
        click('button[title^="file.ts"]')
        wait_for(lambda: "99" in text(), "watcher detects 99")
        click('input[aria-label="file.ts: colocar no stage"]')
        wait_for(lambda: "Em stage" in text(), "staged for amend")
        click('input[aria-label="Emendar último commit (amend)"]')
        wait_for(lambda: execute("return document.querySelector('button[type=submit]').innerText.includes('Emendar')"), "amend button text")
        time.sleep(0.5)
        capture("native-amend.png")
        click('button[type="submit"]')
        wait_for(lambda: git(repo, "log", "-1", "--format=%s").strip() == "Native smoke commit", "amend completed in git")

        click('button[title^="Native smoke commit"]')
        wait_for(lambda: "Arquivos do commit" in text(), "historical files")
        assert execute("return document.querySelectorAll('input[type=checkbox]').length") == 0
        assert execute("return document.querySelector('#commit-message')") is None
        click('button[title^="file.ts"]')
        wait_for(lambda: "99" in text() or "answer" in text(), "historical preview")
        capture("native-history.png")
        click('button[title="Lado a lado"]')
        time.sleep(1)
        capture("native-split.png")

        # Testa aba Início e captura
        click('button[aria-label="Página inicial"]')
        time.sleep(1)
        capture("native-home.png")

        # Abre atalhos do teclado pelo botão de ajuda no footer e captura
        click('.footer-help-btn')
        time.sleep(0.5)
        capture("native-shortcuts.png")

        print("Native stage, commit, history, split diff, home and shortcuts passed", flush=True)
finally:
    if session_id:
        try:
            request("DELETE", "/session/" + session_id)
        except Exception:
            pass
    try:
        driver.terminate()
        driver.wait(timeout=5)
    except Exception:
        driver.kill()
    log.close()
