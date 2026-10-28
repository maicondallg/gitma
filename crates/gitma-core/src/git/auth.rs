use crate::domain::{GitAccountOption, GitError, GitErrorCategory, GitResult, RepoAuthState};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const CACHE_TTL: Duration = Duration::from_secs(60);

#[derive(Clone, Debug)]
struct LocalSshKey {
    name: String,
    private_path: PathBuf,
    signature: String,
}

#[derive(Clone, Debug)]
struct GhUser {
    login: String,
    active: bool,
}

struct DiscoveryCache {
    updated_at: Option<Instant>,
    accounts: Vec<GitAccountOption>,
}

static DISCOVERY_CACHE: OnceLock<Mutex<DiscoveryCache>> = OnceLock::new();
static GH_KEYS_CACHE: OnceLock<Mutex<HashMap<String, Vec<String>>>> = OnceLock::new();
static GH_TOKEN_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct ExecutionAuth {
    pub account_id: String,
    pub label: String,
    pub is_auto: bool,
    pub ssh_command: Option<String>,
    pub gh_token: Option<String>,
    pub git_config_args: Vec<String>,
}

pub fn invalidate_auth_cache() {
    if let Some(cache) = DISCOVERY_CACHE.get() {
        if let Ok(mut guard) = cache.lock() {
            guard.updated_at = None;
        }
    }
    if let Some(cache) = GH_TOKEN_CACHE.get() {
        if let Ok(mut guard) = cache.lock() {
            guard.clear();
        }
    }
}

pub fn discover_accounts(force_refresh: bool) -> Vec<GitAccountOption> {
    let cache = DISCOVERY_CACHE.get_or_init(|| {
        Mutex::new(DiscoveryCache {
            updated_at: None,
            accounts: Vec::new(),
        })
    });

    if !force_refresh {
        if let Ok(guard) = cache.lock() {
            if let Some(updated_at) = guard.updated_at {
                if updated_at.elapsed() < CACHE_TTL {
                    return guard.accounts.clone();
                }
            }
        }
    } else {
        invalidate_auth_cache();
    }

    let ssh_keys = discover_local_ssh_keys();
    let gh_users = discover_gh_users();
    let mut accounts = Vec::new();
    let mut paired_ssh_names = HashSet::new();

    // Fetch GitHub public keys for each gh user in parallel so we can pair
    // each GitHub account with its corresponding local ~/.ssh key.
    let gh_pub_keys: HashMap<String, Vec<String>> = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for user in &gh_users {
            let login = user.login.clone();
            handles.push(scope.spawn(move || {
                let keys = fetch_gh_user_public_keys(&login);
                (login, keys)
            }));
        }
        let mut map = HashMap::new();
        for handle in handles {
            if let Ok((login, keys)) = handle.join() {
                map.insert(login, keys);
            }
        }
        map
    });

    for user in &gh_users {
        let mut matched_key: Option<&LocalSshKey> = None;

        // 1. Exact public key signature match against GitHub API `/users/{login}/keys`
        if let Some(remote_sigs) = gh_pub_keys.get(&user.login) {
            matched_key = ssh_keys
                .iter()
                .find(|local| remote_sigs.iter().any(|sig| sig == &local.signature));
        }

        // 2. Offline heuristic fallback by token overlap (e.g., "petro" in "maicon-dallagnol-prestserv_petro" and "id_petro")
        if matched_key.is_none() {
            let login_tokens = meaningful_tokens(&user.login);
            matched_key = ssh_keys.iter().find(|local| {
                !paired_ssh_names.contains(&local.name)
                    && meaningful_tokens(&local.name).iter().any(|t| {
                        login_tokens
                            .iter()
                            .any(|lt| lt.contains(t) || t.contains(lt))
                    })
            });
        }

        // 3. Standard default key fallback (`id_ed25519` or `id_rsa`) if not yet paired
        if matched_key.is_none() {
            matched_key = ssh_keys.iter().find(|local| {
                !paired_ssh_names.contains(&local.name)
                    && (local.name == "id_ed25519" || local.name == "id_rsa")
            });
        }

        if let Some(k) = matched_key {
            paired_ssh_names.insert(k.name.clone());
        }

        accounts.push(GitAccountOption {
            id: format!("gh:{}", user.login),
            label: user.login.clone(),
            kind: "github".to_string(),
            username: Some(user.login.clone()),
            ssh_key_path: matched_key.map(|k| k.private_path.to_string_lossy().into_owned()),
            ssh_key_name: matched_key.map(|k| k.name.clone()),
            is_gh_active: user.active,
        });
    }

    // Also include remaining standalone SSH keys so the user can select any specific key
    for key in &ssh_keys {
        if paired_ssh_names.contains(&key.name) {
            continue;
        }
        accounts.push(GitAccountOption {
            id: format!("ssh:{}", key.name),
            label: format!("{} (SSH)", key.name),
            kind: "ssh".to_string(),
            username: None,
            ssh_key_path: Some(key.private_path.to_string_lossy().into_owned()),
            ssh_key_name: Some(key.name.clone()),
            is_gh_active: false,
        });
    }

    if let Ok(mut guard) = cache.lock() {
        guard.updated_at = Some(Instant::now());
        guard.accounts = accounts.clone();
    }

    accounts
}

pub fn get_repo_auth_state(root: &Path, force_refresh: bool) -> RepoAuthState {
    let accounts = discover_accounts(force_refresh);
    let selected_id =
        read_local_config(root, "gitma.account").unwrap_or_else(|| "auto".to_string());
    let remote_urls = read_repo_remote_urls(root);

    let (resolved_opt, reason) =
        resolve_account_option(root, &selected_id, &remote_urls, &accounts);

    RepoAuthState {
        selected_id,
        resolved_id: resolved_opt.as_ref().map(|a| a.id.clone()),
        resolved_label: resolved_opt.as_ref().map(|a| a.label.clone()),
        resolution_reason: reason,
        accounts,
    }
}

pub fn set_repo_account(root: &Path, account_id: &str) -> GitResult<RepoAuthState> {
    let trimmed = account_id.trim();
    let mode = if trimmed.is_empty() { "auto" } else { trimmed };

    let status = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["config", "--local", "gitma.account", mode])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| GitError {
            category: GitErrorCategory::Io,
            message: "Não foi possível salvar a conta no repositório".into(),
            details: Some(e.to_string()),
        })?;

    if !status.success() {
        return Err(GitError {
            category: GitErrorCategory::Process,
            message: "Falha ao gravar configuração gitma.account".into(),
            details: None,
        });
    }

    // Clear any cached auto-resolved fallback when the user changes the setting
    let _ = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["config", "--local", "--unset", "gitma.resolvedAccount"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    Ok(get_repo_auth_state(root, false))
}

pub fn save_auto_resolved_account(root: &Path, account_id: &str) {
    let _ = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["config", "--local", "gitma.resolvedAccount", account_id])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// Resolves the primary `ExecutionAuth` for a network Git operation in `root`,
/// plus any fallback `ExecutionAuth`s to try if the repository is in `"auto"` mode
/// and the primary account fails with "Repository not found" / "Permission denied".
pub fn resolve_network_auth_plan(
    root: &Path,
    extra_urls: &[String],
) -> (Option<ExecutionAuth>, Vec<ExecutionAuth>) {
    let selected_id =
        read_local_config(root, "gitma.account").unwrap_or_else(|| "auto".to_string());
    if selected_id == "system" {
        return (None, Vec::new());
    }

    let mut remote_urls = read_repo_remote_urls(root);
    for u in extra_urls {
        if !u.trim().is_empty() {
            remote_urls.push(u.trim().to_string());
        }
    }

    // If all URLs are local filesystem paths and the user hasn't forced an account,
    // skip network auth discovery entirely so local operations/tests have zero overhead.
    let has_network_url = remote_urls.iter().any(|u| is_network_remote_url(u));
    if !has_network_url && selected_id == "auto" {
        return (None, Vec::new());
    }

    let accounts = discover_accounts(false);
    if accounts.is_empty() {
        return (None, Vec::new());
    }

    let is_github_remote = remote_urls
        .iter()
        .any(|u| u.to_lowercase().contains("github.com"));
    let is_auto = selected_id == "auto";

    let (primary_opt, _) = resolve_account_option(root, &selected_id, &remote_urls, &accounts);
    let primary_auth = primary_opt
        .as_ref()
        .and_then(|opt| build_execution_auth(opt, is_auto, is_github_remote));

    let mut fallbacks = Vec::new();
    if is_auto {
        let primary_id = primary_opt.as_ref().map(|a| a.id.as_str()).unwrap_or("");
        // Prioritize GitHub accounts first, then standalone SSH keys
        for acc in &accounts {
            if acc.id == primary_id {
                continue;
            }
            if is_github_remote && acc.kind != "github" {
                continue;
            }
            if let Some(exec_auth) = build_execution_auth(acc, true, is_github_remote) {
                fallbacks.push(exec_auth);
            }
        }
    }

    (primary_auth, fallbacks)
}

fn resolve_account_option(
    root: &Path,
    selected_id: &str,
    remote_urls: &[String],
    accounts: &[GitAccountOption],
) -> (Option<GitAccountOption>, String) {
    if selected_id == "system" {
        return (None, "system".to_string());
    }

    if selected_id != "auto" {
        if let Some(found) = accounts.iter().find(|a| a.id == selected_id) {
            return (Some(found.clone()), "manual".to_string());
        }
        // Handle case where user configured `gh:<login>` or `ssh:<name>` not currently in cached list
        if let Some(login) = selected_id.strip_prefix("gh:") {
            return (
                Some(GitAccountOption {
                    id: selected_id.to_string(),
                    label: login.to_string(),
                    kind: "github".to_string(),
                    username: Some(login.to_string()),
                    ssh_key_path: None,
                    ssh_key_name: None,
                    is_gh_active: false,
                }),
                "manual".to_string(),
            );
        }
    }

    // Auto mode resolution:
    // 1. Check if a previous auto-fallback verified and saved a working account for this repo
    if let Some(saved_auto) = read_local_config(root, "gitma.resolvedAccount") {
        if let Some(found) = accounts.iter().find(|a| a.id == saved_auto) {
            return (Some(found.clone()), "verified".to_string());
        }
    }

    // 2. Exact match between remote URL owner/username and a discovered GitHub account
    for url in remote_urls {
        if let Some(explicit_user) = extract_url_explicit_username(url) {
            if let Some(found) = accounts.iter().find(|a| {
                a.username
                    .as_deref()
                    .is_some_and(|u| u.eq_ignore_ascii_case(&explicit_user))
            }) {
                return (Some(found.clone()), "owner-match".to_string());
            }
        }
        if let Some(owner) = extract_remote_owner(url) {
            if let Some(found) = accounts.iter().find(|a| {
                a.username
                    .as_deref()
                    .is_some_and(|u| u.eq_ignore_ascii_case(&owner))
            }) {
                return (Some(found.clone()), "owner-match".to_string());
            }
        }
    }

    // 3. Token / Heuristic match on remote URL host alias or organization name
    // (e.g., `petrobras.github.com` or `github.com/petrobras/...` -> matches `maicon-dallagnol-prestserv_petro` / `id_petro`)
    for url in remote_urls {
        let url_tokens = meaningful_tokens(url);
        if let Some(found) = accounts.iter().find(|a| {
            let acc_tokens = meaningful_tokens(&a.label);
            let key_tokens = a
                .ssh_key_name
                .as_deref()
                .map(meaningful_tokens)
                .unwrap_or_default();
            url_tokens.iter().any(|ut| {
                acc_tokens
                    .iter()
                    .any(|at| at.contains(ut) || ut.contains(at))
                    || key_tokens
                        .iter()
                        .any(|kt| kt.contains(ut) || ut.contains(kt))
            })
        }) {
            return (Some(found.clone()), "heuristic".to_string());
        }
    }

    // 4. Local repo `user.email` / `user.name` heuristic (only `--local`, never `--global`)
    if let Some(local_email) = read_local_config(root, "user.email") {
        let email_tokens = meaningful_tokens(&local_email);
        if let Some(found) = accounts.iter().find(|a| {
            let acc_tokens = meaningful_tokens(&a.label);
            email_tokens.iter().any(|et| {
                acc_tokens
                    .iter()
                    .any(|at| at.contains(et) || et.contains(at))
            })
        }) {
            return (Some(found.clone()), "heuristic".to_string());
        }
    }

    // 5. Fallback to active `gh` account or first discovered GitHub account
    if let Some(active) = accounts.iter().find(|a| a.is_gh_active) {
        return (Some(active.clone()), "gh-active".to_string());
    }
    if let Some(first_gh) = accounts.iter().find(|a| a.kind == "github") {
        return (Some(first_gh.clone()), "default".to_string());
    }
    if let Some(first) = accounts.first() {
        return (Some(first.clone()), "default".to_string());
    }

    (None, "none".to_string())
}

fn build_execution_auth(
    account: &GitAccountOption,
    is_auto: bool,
    is_github_remote: bool,
) -> Option<ExecutionAuth> {
    let mut ssh_command = None;
    let mut gh_token = None;
    let mut git_config_args = Vec::new();

    if let Some(key_path) = &account.ssh_key_path {
        let quoted_path = format!("'{}'", key_path.replace('\'', "'\\''"));
        if account.kind == "github" || is_github_remote {
            // `-F none` prevents ~/.ssh/config from injecting a conflicting IdentityFile
            // under `Host github.com`, while `-o HostName=github.com -o User=git` ensures
            // custom SSH host aliases (like `petrobras.github.com`) still connect to GitHub.
            ssh_command = Some(format!(
                "ssh -F none -o HostName=github.com -o User=git -i {quoted_path} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
            ));
        } else {
            ssh_command = Some(format!(
                "ssh -i {quoted_path} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
            ));
        }
    }

    if let Some(login) = &account.username {
        if let Some(token) = fetch_gh_token(login) {
            gh_token = Some(token);
            git_config_args.push("-c".to_string());
            git_config_args.push("credential.helper=".to_string());
            git_config_args.push("-c".to_string());
            git_config_args.push("credential.helper=!gh auth git-credential".to_string());

            // If this GitHub account has no local SSH key paired, rewrite SSH GitHub URLs
            // to HTTPS on the fly so `gh auth git-credential` + `GH_TOKEN` can authenticate them!
            if ssh_command.is_none() {
                git_config_args.push("-c".to_string());
                git_config_args
                    .push("url.https://github.com/.insteadOf=git@github.com:".to_string());
                git_config_args.push("-c".to_string());
                git_config_args
                    .push("url.https://github.com/.insteadOf=ssh://git@github.com/".to_string());
            }
        }
    }

    if ssh_command.is_none() && gh_token.is_none() {
        return None;
    }

    Some(ExecutionAuth {
        account_id: account.id.clone(),
        label: account.label.clone(),
        is_auto,
        ssh_command,
        gh_token,
        git_config_args,
    })
}

fn discover_local_ssh_keys() -> Vec<LocalSshKey> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let ssh_dir = home.join(".ssh");
    let Ok(entries) = std::fs::read_dir(&ssh_dir) else {
        return Vec::new();
    };

    let mut keys = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("pub") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let private_path = ssh_dir.join(stem);
        if !private_path.is_file() {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        if let Some(sig) = normalize_pub_key_signature(&content) {
            keys.push(LocalSshKey {
                name: stem.to_string(),
                private_path,
                signature: sig,
            });
        }
    }
    keys.sort_by(|a, b| a.name.cmp(&b.name));
    keys
}

fn normalize_pub_key_signature(raw: &str) -> Option<String> {
    let line = raw
        .lines()
        .find(|l| !l.trim().is_empty() && !l.trim().starts_with('#'))?;
    let mut parts = line.split_whitespace();
    let key_type = parts.next()?;
    let key_blob = parts.next()?;
    if !key_type.starts_with("ssh-") && !key_type.starts_with("ecdsa-") {
        return None;
    }
    Some(format!("{key_type} {key_blob}"))
}

fn discover_gh_users() -> Vec<GhUser> {
    let mut cmd = Command::new("gh");
    cmd.args(["auth", "status", "--json", "hosts"])
        .env("NO_COLOR", "1")
        .env("GH_PROMPT_DISABLED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut cmd);

    if let Ok(output) = cmd.output() {
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
            if let Some(hosts) = json.get("hosts").and_then(|h| h.as_object()) {
                let mut users = Vec::new();
                for (_host, entries) in hosts {
                    if let Some(arr) = entries.as_array() {
                        for item in arr {
                            let login = item
                                .get("login")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim();
                            let state = item
                                .get("state")
                                .and_then(|v| v.as_str())
                                .unwrap_or("success");
                            let active = item
                                .get("active")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            if !login.is_empty()
                                && state == "success"
                                && !users.iter().any(|u: &GhUser| u.login == login)
                            {
                                users.push(GhUser {
                                    login: login.to_string(),
                                    active,
                                });
                            }
                        }
                    }
                }
                if !users.is_empty() {
                    return users;
                }
            }
        }
    }

    // Fallback for older `gh` CLI versions without `--json`
    let mut fallback = Command::new("gh");
    fallback
        .args(["auth", "status"])
        .env("NO_COLOR", "1")
        .env("GH_PROMPT_DISABLED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut fallback);

    let Ok(out) = fallback.output() else {
        return Vec::new();
    };
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    parse_gh_status_text(&combined)
}

fn parse_gh_status_text(text: &str) -> Vec<GhUser> {
    let mut users: Vec<GhUser> = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(idx) = trimmed.find("account ") {
            let after = &trimmed[idx + "account ".len()..];
            let login = after.split_whitespace().next().unwrap_or("").trim();
            if !login.is_empty() && !users.iter().any(|u| u.login == login) {
                users.push(GhUser {
                    login: login.to_string(),
                    active: false,
                });
            }
        } else if trimmed.starts_with("- Active account:") {
            let is_active = trimmed.ends_with("true");
            if let Some(last) = users.last_mut() {
                last.active = is_active;
            }
        }
    }
    users
}

fn fetch_gh_user_public_keys(login: &str) -> Vec<String> {
    let cache = GH_KEYS_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(cached) = guard.get(login) {
            return cached.clone();
        }
    }

    let endpoint = format!("/users/{login}/keys");
    let mut cmd = Command::new("gh");
    cmd.args(["api", &endpoint])
        .env("NO_COLOR", "1")
        .env("GH_PROMPT_DISABLED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_console_window(&mut cmd);

    let mut signatures = Vec::new();
    if let Ok(output) = cmd.output() {
        if output.status.success() {
            if let Ok(serde_json::Value::Array(items)) = serde_json::from_slice(&output.stdout) {
                for item in items {
                    if let Some(raw_key) = item.get("key").and_then(|v| v.as_str()) {
                        if let Some(sig) = normalize_pub_key_signature(raw_key) {
                            signatures.push(sig);
                        }
                    }
                }
            }
        }
    }

    if !signatures.is_empty() {
        if let Ok(mut guard) = cache.lock() {
            guard.insert(login.to_string(), signatures.clone());
        }
    }
    signatures
}

fn fetch_gh_token(login: &str) -> Option<String> {
    let cache = GH_TOKEN_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(token) = guard.get(login) {
            return Some(token.clone());
        }
    }

    let mut cmd = Command::new("gh");
    cmd.args(["auth", "token", "-h", "github.com", "-u", login])
        .env("NO_COLOR", "1")
        .env("GH_PROMPT_DISABLED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_console_window(&mut cmd);

    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return None;
    }
    if let Ok(mut guard) = cache.lock() {
        guard.insert(login.to_string(), token.clone());
    }
    Some(token)
}

fn read_local_config(root: &Path, key: &str) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(root)
        .args(["config", "--local", "--get", key])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_console_window(&mut cmd);

    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let val = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!val.is_empty()).then_some(val)
}

fn read_repo_remote_urls(root: &Path) -> Vec<String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(root)
        .args(["config", "--local", "--get-regexp", r"^remote\..*\.url$"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_console_window(&mut cmd);

    let Ok(out) = cmd.output() else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut urls = Vec::new();
    for line in text.lines() {
        if let Some((_, url)) = line.split_once(char::is_whitespace) {
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                urls.push(trimmed.to_string());
            }
        }
    }
    urls
}

pub fn is_network_remote_url(url: &str) -> bool {
    let trimmed = url.trim();
    trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("ssh://")
        || trimmed.starts_with("git://")
        || (trimmed.contains('@') && trimmed.contains(':'))
}

pub fn extract_url_explicit_username(url: &str) -> Option<String> {
    let trimmed = url.trim();
    let (_, after_scheme) = trimmed.split_once("://")?;
    let (user_part, _) = after_scheme.split_once('@')?;
    let username = user_part.split(':').next()?.trim();
    if username.is_empty() || username.eq_ignore_ascii_case("git") || username.contains('/') {
        return None;
    }
    Some(username.to_string())
}

pub fn extract_remote_owner(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    if let Some((_, after_scheme)) = trimmed.split_once("://") {
        let host_and_path = after_scheme
            .split_once('@')
            .map(|(_, rest)| rest)
            .unwrap_or(after_scheme);
        let (_, path) = host_and_path.split_once('/')?;
        let owner = path.split('/').next()?.trim();
        return (!owner.is_empty()).then(|| owner.to_string());
    }
    // SCP-like SSH syntax: git@github.com:owner/repo
    if let Some((_, path)) = trimmed.split_once(':') {
        let clean = path.trim_start_matches('/');
        let owner = clean.split('/').next()?.trim();
        return (!owner.is_empty()).then(|| owner.to_string());
    }
    None
}

fn meaningful_tokens(input: &str) -> Vec<String> {
    const STOP_WORDS: &[&str] = &[
        "github",
        "gitlab",
        "bitbucket",
        "com",
        "org",
        "net",
        "git",
        "https",
        "http",
        "ssh",
        "origin",
        "main",
        "master",
        "repo",
        "ed25519",
        "rsa",
        "ecdsa",
        "deploy",
        "key",
        "user",
    ];
    input
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .map(str::trim)
        .filter(|s| s.len() >= 4 && !STOP_WORDS.contains(s))
        .map(str::to_string)
        .collect()
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn hide_console_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = command;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_remote_owner_from_ssh_and_https_urls() {
        assert_eq!(
            extract_remote_owner("git@github.com:maicondallg/Gitma.git").as_deref(),
            Some("maicondallg")
        );
        assert_eq!(
            extract_remote_owner(
                "https://github.com/maicon-dallagnol-prestserv_petro/private-repo.git"
            )
            .as_deref(),
            Some("maicon-dallagnol-prestserv_petro")
        );
        assert_eq!(
            extract_remote_owner("ssh://git@github.com/org-name/project.git").as_deref(),
            Some("org-name")
        );
        assert_eq!(
            extract_remote_owner("git@petrobras.github.com:petro-org/service.git").as_deref(),
            Some("petro-org")
        );
    }

    #[test]
    fn extracts_explicit_username_from_https_url() {
        assert_eq!(
            extract_url_explicit_username("https://maicondallg@github.com/org/repo.git").as_deref(),
            Some("maicondallg")
        );
        assert_eq!(
            extract_url_explicit_username("https://github.com/org/repo.git"),
            None
        );
        assert_eq!(
            extract_url_explicit_username("ssh://git@github.com/org/repo.git"),
            None
        );
    }

    #[test]
    fn matches_account_by_owner_and_heuristic() {
        let accounts = vec![
            GitAccountOption {
                id: "gh:maicon-dallagnol-prestserv_petro".into(),
                label: "maicon-dallagnol-prestserv_petro".into(),
                kind: "github".into(),
                username: Some("maicon-dallagnol-prestserv_petro".into()),
                ssh_key_path: Some("/home/user/.ssh/id_petro".into()),
                ssh_key_name: Some("id_petro".into()),
                is_gh_active: true,
            },
            GitAccountOption {
                id: "gh:maicondallg".into(),
                label: "maicondallg".into(),
                kind: "github".into(),
                username: Some("maicondallg".into()),
                ssh_key_path: Some("/home/user/.ssh/id_ed25519".into()),
                ssh_key_name: Some("id_ed25519".into()),
                is_gh_active: false,
            },
        ];

        let temp = tempfile::TempDir::new().unwrap();
        // Owner match for personal account even when company account is gh-active
        let (resolved, reason) = resolve_account_option(
            temp.path(),
            "auto",
            &["git@github.com:maicondallg/Gitma.git".into()],
            &accounts,
        );
        assert_eq!(reason, "owner-match");
        assert_eq!(resolved.unwrap().id, "gh:maicondallg");

        // Heuristic match for company org / host alias
        let (resolved_petro, reason_petro) = resolve_account_option(
            temp.path(),
            "auto",
            &["git@petrobras.github.com:corp-team/internal-api.git".into()],
            &accounts,
        );
        assert_eq!(reason_petro, "heuristic");
        assert_eq!(
            resolved_petro.unwrap().id,
            "gh:maicon-dallagnol-prestserv_petro"
        );
    }
}
