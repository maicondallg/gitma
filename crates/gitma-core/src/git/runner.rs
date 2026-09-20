use crate::domain::{GitError, GitErrorCategory, GitResult};
use std::ffi::OsStr;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

const READ_TIMEOUT: Duration = Duration::from_secs(30);
const MUTATION_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_STDOUT_CAPTURE: usize = 2 * 1024 * 1024 + 1;
const MAX_STDERR_CAPTURE: usize = 64 * 1024;
static CANCELLED: AtomicBool = AtomicBool::new(false);

/// Stops active and subsequent Git subprocesses while the application closes.
pub fn cancel_all() {
    CANCELLED.store(true, Ordering::SeqCst);
}

pub(crate) fn read(root: &Path, args: &[&str]) -> GitResult<Vec<u8>> {
    run(root, args.iter().map(OsStr::new), READ_TIMEOUT, true, true)
}

pub(crate) fn read_os(root: &Path, args: &[&OsStr]) -> GitResult<Vec<u8>> {
    run(root, args.iter().copied(), READ_TIMEOUT, true, true)
}
/// A few plumbing commands (notably `check-ignore`) reject Git's global
/// `--literal-pathspecs` option. Callers must still pass native `OsStr`
/// arguments and never interpolate a shell command.
pub(crate) fn read_os_no_literal(root: &Path, args: &[&OsStr]) -> GitResult<Vec<u8>> {
    run(root, args.iter().copied(), READ_TIMEOUT, true, false)
}

pub(crate) fn mutate(root: &Path, args: &[&str]) -> GitResult<Vec<u8>> {
    run(
        root,
        args.iter().map(OsStr::new),
        MUTATION_TIMEOUT,
        false,
        true,
    )
}

pub(crate) fn mutate_no_literal(root: &Path, args: &[&str]) -> GitResult<Vec<u8>> {
    run(
        root,
        args.iter().map(OsStr::new),
        MUTATION_TIMEOUT,
        false,
        false,
    )
}

pub(crate) fn mutate_os(root: &Path, args: &[&OsStr]) -> GitResult<Vec<u8>> {
    run(root, args.iter().copied(), MUTATION_TIMEOUT, false, true)
}

pub(crate) fn mutate_os_no_literal(root: &Path, args: &[&OsStr]) -> GitResult<Vec<u8>> {
    run(root, args.iter().copied(), MUTATION_TIMEOUT, false, false)
}

fn run<'a>(
    root: &Path,
    args: impl IntoIterator<Item = &'a OsStr>,
    timeout: Duration,
    read_only: bool,
    literal_pathspecs: bool,
) -> GitResult<Vec<u8>> {
    if CANCELLED.load(Ordering::SeqCst) {
        return Err(cancelled_error());
    }
    let mut command = Command::new("git");
    command.arg("-C").arg(root);
    if literal_pathspecs {
        command.arg("--literal-pathspecs");
    }
    command
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_EDITOR", "true")
        .env("LC_ALL", "C")
        // Git may otherwise refresh the index while serving status/log
        // queries, which is surprising and creates watcher self-events.
        .env("GIT_OPTIONAL_LOCKS", if read_only { "0" } else { "1" })
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    command.env("GIT_ASKPASS", "/bin/false");
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // A fetch/push can start SSH or a credential helper. Giving Git its
        // own group lets cancellation close those descendants too, so their
        // inherited pipes cannot keep our reader threads alive.
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Prevent Windows from allocating a visible console window (cmd/conhost)
        // for background Git CLI subprocesses in a GUI application.
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|error| io_error("Não foi possível iniciar o Git", error))?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");
    // Read both pipes while Git is running so a verbose command cannot block
    // on either pipe before its timeout is checked.
    let stdout_reader = thread::spawn(move || read_pipe(stdout, MAX_STDOUT_CAPTURE));
    let stderr_reader = thread::spawn(move || read_pipe(stderr, MAX_STDERR_CAPTURE));

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline && !CANCELLED.load(Ordering::SeqCst) => {
                thread::sleep(Duration::from_millis(10))
            }
            Ok(None) if CANCELLED.load(Ordering::SeqCst) => {
                stop_child(&mut child);
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(cancelled_error());
            }
            Ok(None) => {
                stop_child(&mut child);
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GitError {
                    category: GitErrorCategory::Process,
                    message: "O Git excedeu o tempo limite".into(),
                    details: None,
                });
            }
            Err(error) => {
                stop_child(&mut child);
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(io_error("Não foi possível aguardar o Git", error));
            }
        }
    };

    let stdout = join_pipe(stdout_reader)?;
    let stderr = join_pipe(stderr_reader)?;
    if status.success() {
        return Ok(stdout);
    }

    let detail = sanitize_error(&String::from_utf8_lossy(&stderr));
    let lower = detail.to_lowercase();
    let category = if lower.contains("not a git repository") {
        GitErrorCategory::NotRepository
    } else if lower.contains("authentication")
        || lower.contains("could not read username")
        || lower.contains("permission denied")
        || lower.contains("terminal prompts disabled")
    {
        GitErrorCategory::Authentication
    } else if lower.contains("conflict")
        || lower.contains("unmerged")
        || lower.contains("needs merge")
        || lower.contains("merge failed")
    {
        GitErrorCategory::Conflict
    } else if lower.contains("diverg")
        || lower.contains("non-fast-forward")
        || lower.contains("not possible to fast-forward")
    {
        GitErrorCategory::Diverged
    } else {
        GitErrorCategory::Process
    };
    let message = match category {
        GitErrorCategory::NotRepository => "O caminho não é um repositório Git",
        GitErrorCategory::Authentication => "Falha de autenticação do Git",
        GitErrorCategory::Conflict => "A operação encontrou conflitos",
        GitErrorCategory::Diverged => "O histórico remoto divergiu",
        _ => "Falha ao executar o Git",
    }
    .into();
    Err(GitError {
        category,
        message,
        details: (!detail.is_empty()).then_some(detail),
    })
}

fn stop_child(child: &mut std::process::Child) {
    #[cfg(unix)]
    unsafe {
        // Negative PID targets the process group created above. Ignore ESRCH:
        // Git may have exited between try_wait and this call.
        libc::kill(-(child.id() as libc::pid_t), libc::SIGKILL);
    }
    let _ = child.kill();
}

fn read_pipe(mut pipe: impl Read, max_capture: usize) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 8192];
    loop {
        let read = pipe.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let available = max_capture.saturating_sub(bytes.len());
        bytes.extend_from_slice(&buffer[..read.min(available)]);
    }
    Ok(bytes)
}

fn join_pipe(handle: thread::JoinHandle<std::io::Result<Vec<u8>>>) -> GitResult<Vec<u8>> {
    handle
        .join()
        .map_err(|_| GitError {
            category: GitErrorCategory::Io,
            message: "Não foi possível ler a saída do Git".into(),
            details: None,
        })?
        .map_err(|error| io_error("Não foi possível ler a saída do Git", error))
}

fn io_error(message: &str, error: std::io::Error) -> GitError {
    GitError {
        category: GitErrorCategory::Io,
        message: message.into(),
        details: Some(sanitize_error(&error.to_string())),
    }
}

fn cancelled_error() -> GitError {
    GitError {
        category: GitErrorCategory::Process,
        message: "Operação Git cancelada".into(),
        details: None,
    }
}

fn sanitize_error(value: &str) -> String {
    let mut cleaned = value.replace(['\r', '\n'], " ");
    // Git commonly embeds an authenticated remote URL in transport errors.
    // Keep the host and path useful while never returning its credentials.
    let mut search_from = 0;
    while let Some(offset) = cleaned[search_from..].find("://") {
        let scheme = search_from + offset;
        let credentials_start = scheme + 3;
        let tail = &cleaned[credentials_start..];
        let Some(at) = tail.find('@') else {
            search_from = credentials_start;
            continue;
        };
        let at = credentials_start + at;
        let credential = &cleaned[credentials_start..at];
        if credential.contains('/') || credential.contains(' ') {
            search_from = credentials_start;
            continue;
        }
        cleaned.replace_range(credentials_start..=at, "***@");
        search_from = credentials_start + 4;
    }
    cleaned.trim().chars().take(4096).collect()
}
