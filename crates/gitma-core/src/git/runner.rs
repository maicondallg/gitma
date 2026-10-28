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

pub(crate) fn mutate_with_stdin(root: &Path, args: &[&str], input: &[u8]) -> GitResult<Vec<u8>> {
    run_with_input(
        root,
        args.iter().map(OsStr::new),
        MUTATION_TIMEOUT,
        false,
        true,
        Some(input),
    )
}

pub(crate) fn run_raw(root: &Path, args: &[&OsStr]) -> GitResult<String> {
    if is_network_git_command(args) {
        let extra_urls = extract_url_args(args);
        let (primary_auth, fallback_auths) =
            super::auth::resolve_network_auth_plan(root, &extra_urls);
        match run_raw_once(root, args, primary_auth.as_ref()) {
            Ok(out) => return Ok(out),
            Err(err) if !fallback_auths.is_empty() && is_auth_or_access_error(&err.message) => {
                for alt in &fallback_auths {
                    if CANCELLED.load(Ordering::SeqCst) {
                        break;
                    }
                    if let Ok(out) = run_raw_once(root, args, Some(alt)) {
                        super::auth::save_auto_resolved_account(root, &alt.account_id);
                        return Ok(out);
                    }
                }
                return Err(err);
            }
            Err(err) => return Err(err),
        }
    }
    run_raw_once(root, args, None)
}

fn run_raw_once(
    root: &Path,
    args: &[&OsStr],
    auth: Option<&super::auth::ExecutionAuth>,
) -> GitResult<String> {
    if CANCELLED.load(Ordering::SeqCst) {
        return Err(cancelled_error());
    }
    let mut command = Command::new("git");
    command.arg("-C").arg(root);
    apply_execution_auth(&mut command, auth);
    command
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_EDITOR", "true")
        .env("LC_ALL", "C")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    command.env("GIT_ASKPASS", "/bin/false");
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|error| io_error("Não foi possível iniciar o Git", error))?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");
    let stdout_reader = thread::spawn(move || read_pipe(stdout, MAX_STDOUT_CAPTURE));
    let stderr_reader = thread::spawn(move || read_pipe(stderr, MAX_STDERR_CAPTURE));

    let deadline = Instant::now() + MUTATION_TIMEOUT;
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline && !CANCELLED.load(Ordering::SeqCst) => {
                let elapsed = started.elapsed();
                let interval = if elapsed < Duration::from_millis(5) {
                    Duration::from_micros(150)
                } else if elapsed < Duration::from_millis(50) {
                    Duration::from_millis(1)
                } else {
                    Duration::from_millis(10)
                };
                thread::sleep(interval)
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

    let stdout_bytes = join_pipe(stdout_reader)?;
    let stderr_bytes = join_pipe(stderr_reader)?;
    let stdout_str = String::from_utf8_lossy(&stdout_bytes)
        .trim_end()
        .to_string();
    let stderr_str = String::from_utf8_lossy(&stderr_bytes)
        .trim_end()
        .to_string();

    if status.success() {
        if !stdout_str.is_empty() && !stderr_str.is_empty() {
            Ok(format!("{stdout_str}\n{stderr_str}"))
        } else if !stdout_str.is_empty() {
            Ok(stdout_str)
        } else if !stderr_str.is_empty() {
            Ok(stderr_str)
        } else {
            Ok("Comando executado com sucesso (sem saída).".to_string())
        }
    } else {
        let err_output = if !stderr_str.is_empty() {
            stderr_str
        } else if !stdout_str.is_empty() {
            stdout_str
        } else {
            format!("Código de saída: {}", status.code().unwrap_or(-1))
        };
        Err(GitError {
            category: GitErrorCategory::Process,
            message: err_output,
            details: None,
        })
    }
}

fn run<'a>(
    root: &Path,
    args: impl IntoIterator<Item = &'a OsStr>,
    timeout: Duration,
    read_only: bool,
    literal_pathspecs: bool,
) -> GitResult<Vec<u8>> {
    run_with_input(root, args, timeout, read_only, literal_pathspecs, None)
}

fn run_with_input<'a>(
    root: &Path,
    args: impl IntoIterator<Item = &'a OsStr>,
    timeout: Duration,
    read_only: bool,
    literal_pathspecs: bool,
    input: Option<&[u8]>,
) -> GitResult<Vec<u8>> {
    let arg_vec: Vec<&'a OsStr> = args.into_iter().collect();
    if !read_only && is_network_git_command(&arg_vec) {
        let extra_urls = extract_url_args(&arg_vec);
        let (primary_auth, fallback_auths) =
            super::auth::resolve_network_auth_plan(root, &extra_urls);
        match run_once_with_input(
            root,
            &arg_vec,
            timeout,
            read_only,
            literal_pathspecs,
            input,
            primary_auth.as_ref(),
        ) {
            Ok(out) => return Ok(out),
            Err(err)
                if !fallback_auths.is_empty()
                    && (err.category == GitErrorCategory::Authentication
                        || is_auth_or_access_error(
                            err.details.as_deref().unwrap_or(&err.message),
                        )) =>
            {
                for alt in &fallback_auths {
                    if CANCELLED.load(Ordering::SeqCst) {
                        break;
                    }
                    if let Ok(out) = run_once_with_input(
                        root,
                        &arg_vec,
                        timeout,
                        read_only,
                        literal_pathspecs,
                        input,
                        Some(alt),
                    ) {
                        super::auth::save_auto_resolved_account(root, &alt.account_id);
                        return Ok(out);
                    }
                }
                return Err(err);
            }
            Err(err) => return Err(err),
        }
    }
    run_once_with_input(
        root,
        &arg_vec,
        timeout,
        read_only,
        literal_pathspecs,
        input,
        None,
    )
}

fn run_once_with_input(
    root: &Path,
    args: &[&OsStr],
    timeout: Duration,
    read_only: bool,
    literal_pathspecs: bool,
    input: Option<&[u8]>,
    auth: Option<&super::auth::ExecutionAuth>,
) -> GitResult<Vec<u8>> {
    if CANCELLED.load(Ordering::SeqCst) {
        return Err(cancelled_error());
    }
    let mut command = Command::new("git");
    command.arg("-C").arg(root);
    apply_execution_auth(&mut command, auth);
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
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
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

    if let Some(bytes) = input {
        let bytes = bytes.to_vec();
        if let Some(mut stdin) = child.stdin.take() {
            thread::spawn(move || {
                use std::io::Write;
                let _ = stdin.write_all(&bytes);
                let _ = stdin.flush();
            });
        }
    }

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");
    // Read both pipes while Git is running so a verbose command cannot block
    // on either pipe before its timeout is checked.
    let stdout_reader = thread::spawn(move || read_pipe(stdout, MAX_STDOUT_CAPTURE));
    let stderr_reader = thread::spawn(move || read_pipe(stderr, MAX_STDERR_CAPTURE));

    let deadline = Instant::now() + timeout;
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline && !CANCELLED.load(Ordering::SeqCst) => {
                // Most local Git commands finish in under a millisecond. Poll
                // them promptly, then back off for slower network operations.
                let elapsed = started.elapsed();
                let interval = if elapsed < Duration::from_millis(5) {
                    Duration::from_micros(150)
                } else if elapsed < Duration::from_millis(50) {
                    Duration::from_millis(1)
                } else {
                    Duration::from_millis(10)
                };
                thread::sleep(interval)
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
    } else if is_auth_or_access_error(&lower) {
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
    } else if lower.contains("no such ref was fetched")
        || lower.contains("your configuration specifies to merge with the ref")
    {
        GitErrorCategory::RemoteRefNotFound
    } else {
        GitErrorCategory::Process
    };
    let message = match category {
        GitErrorCategory::NotRepository => "O caminho não é um repositório Git",
        GitErrorCategory::Authentication => "Falha de autenticação ou permissão no repositório remoto",
        GitErrorCategory::Conflict => "A operação encontrou conflitos",
        GitErrorCategory::Diverged => "O histórico remoto divergiu",
        GitErrorCategory::RemoteRefNotFound => "A branch remota vinculada não existe mais no servidor (pode ter sido excluída após o merge)",
        _ => "Falha ao executar o Git",
    }
    .into();
    Err(GitError {
        category,
        message,
        details: (!detail.is_empty()).then_some(detail),
    })
}

fn apply_execution_auth(command: &mut Command, auth: Option<&super::auth::ExecutionAuth>) {
    if let Some(auth) = auth {
        for arg in &auth.git_config_args {
            command.arg(arg);
        }
        if let Some(ssh_cmd) = &auth.ssh_command {
            command.env("GIT_SSH_COMMAND", ssh_cmd);
        }
        if let Some(token) = &auth.gh_token {
            command.env("GH_TOKEN", token);
            command.env("GITHUB_TOKEN", token);
        }
    }
}

fn is_network_git_command(args: &[&OsStr]) -> bool {
    args.iter().any(|arg| {
        matches!(
            arg.to_str(),
            Some("push" | "fetch" | "pull" | "clone" | "ls-remote" | "submodule")
        )
    })
}

fn extract_url_args(args: &[&OsStr]) -> Vec<String> {
    args.iter()
        .filter_map(|a| a.to_str())
        .filter(|s| super::auth::is_network_remote_url(s))
        .map(str::to_string)
        .collect()
}

fn is_auth_or_access_error(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("authentication")
        || lower.contains("could not read username")
        || lower.contains("permission denied")
        || lower.contains("permission to ")
        || lower.contains("terminal prompts disabled")
        || lower.contains("repository not found")
        || lower.contains("could not read from remote repository")
        || lower.contains("returned error: 403")
        || lower.contains("returned error: 401")
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
