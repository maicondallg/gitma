use super::runner::{mutate, mutate_no_literal, mutate_os, mutate_os_no_literal, read};
use crate::domain::{
    BlameLine, ChangedFile, CommitDetails, FileHistoryEntry, FileStatus, GitError,
    GitErrorCategory, GitResult, InProgressKind, InProgressOp, ReflogEntry, RemoteEntry,
};
use std::ffi::OsStr;
use std::path::Path;

pub fn stage(root: &Path, path: &Path) -> GitResult<()> {
    mutate_os(
        root,
        &[
            OsStr::new("add"),
            OsStr::new("-A"),
            OsStr::new("--"),
            path.as_os_str(),
        ],
    )
    .map(|_| ())
}
pub fn unstage(root: &Path, path: &Path) -> GitResult<()> {
    unstage_paths(root, &[path])
}
pub fn stage_file(root: &Path, file: &ChangedFile) -> GitResult<()> {
    stage_paths(root, "add", file)
}
pub fn unstage_file(root: &Path, file: &ChangedFile) -> GitResult<()> {
    let mut paths = Vec::new();
    if let Some(old_path) = &file.old_path {
        paths.push(old_path.as_path());
    }
    paths.push(file.path.as_path());
    unstage_paths(root, &paths)
}

fn stage_paths(root: &Path, command: &str, file: &ChangedFile) -> GitResult<()> {
    let mut args = vec![OsStr::new(command)];
    if command == "add" {
        args.push(OsStr::new("-A"));
    }
    args.push(OsStr::new("--"));
    if let Some(old_path) = &file.old_path {
        if root.join(old_path).exists()
            || super::runner::read_os(
                root,
                &[
                    OsStr::new("ls-files"),
                    OsStr::new("--error-unmatch"),
                    OsStr::new("--"),
                    old_path.as_os_str(),
                ],
            )
            .is_ok()
        {
            args.push(old_path.as_os_str());
        }
    }
    args.push(file.path.as_os_str());
    mutate_os(root, &args).map(|_| ())
}

fn unstage_paths(root: &Path, paths: &[&Path]) -> GitResult<()> {
    let mut reset = vec![OsStr::new("reset"), OsStr::new("--")];
    reset.extend(paths.iter().map(|path| path.as_os_str()));
    match mutate_os(root, &reset) {
        Ok(_) => Ok(()),
        // An unborn repository has no HEAD for `git reset -- <path>` to read.
        // Removing the index entry is the corresponding unstage operation.
        Err(error) if error.category == GitErrorCategory::Process => {
            if super::runner::read(root, &["rev-parse", "--verify", "HEAD"]).is_ok() {
                return Err(error);
            }
            let mut remove = vec![
                OsStr::new("rm"),
                OsStr::new("--cached"),
                OsStr::new("--ignore-unmatch"),
                OsStr::new("--"),
            ];
            remove.extend(paths.iter().map(|path| path.as_os_str()));
            mutate_os(root, &remove).map(|_| ())
        }
        Err(error) => Err(error),
    }
}
pub fn commit(root: &Path, message: &str) -> GitResult<String> {
    let out = mutate(root, &["commit", "--no-edit", "-m", message])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}
pub fn commit_amend(root: &Path, message: &str) -> GitResult<String> {
    let message = message.trim();
    let out = if message.is_empty() {
        mutate(root, &["commit", "--amend", "--no-edit"])?
    } else {
        mutate(root, &["commit", "--amend", "-m", message])?
    };
    Ok(String::from_utf8_lossy(&out).into_owned())
}
pub fn fetch(root: &Path) -> GitResult<()> {
    mutate(root, &["fetch", "--prune"]).map(|_| ())
}
pub fn pull(root: &Path) -> GitResult<()> {
    pull_with_strategy(root, None)
}

pub fn pull_with_strategy(root: &Path, strategy: Option<&str>) -> GitResult<()> {
    match strategy {
        Some("rebase") => mutate(root, &["pull", "--rebase"]).map(|_| ()),
        Some("merge") => mutate(root, &["pull", "--no-ff"]).map(|_| ()),
        Some("default") => mutate(root, &["pull"]).map(|_| ()),
        _ => mutate(root, &["pull", "--ff-only"]).map(|_| ()),
    }
}
pub fn push(root: &Path) -> GitResult<()> {
    mutate(root, &["push"]).map(|_| ())
}
pub fn push_force_with_lease(root: &Path) -> GitResult<()> {
    mutate(root, &["push", "--force-with-lease"]).map(|_| ())
}
pub fn checkout_branch(root: &Path, branch: &str) -> GitResult<()> {
    let mut trimmed = branch.trim();
    if let Some(stripped) = trimmed.strip_prefix("tag: ") {
        trimmed = stripped.trim();
    }
    if let Some(stripped) = trimmed.strip_prefix("refs/tags/") {
        trimmed = stripped.trim();
    }
    let normalized = trimmed.strip_prefix("remotes/").unwrap_or(trimmed);

    let remote_ref = format!("refs/remotes/{normalized}");
    if super::runner::read(root, &["show-ref", "--verify", &remote_ref]).is_ok() {
        let local_name = if let Ok(remotes_out) = super::runner::read(root, &["remote"]) {
            let remotes_str = String::from_utf8_lossy(&remotes_out);
            let mut matched = None;
            for r in remotes_str.lines().map(str::trim).filter(|s| !s.is_empty()) {
                let prefix = format!("{r}/");
                if let Some(rest) = normalized.strip_prefix(&prefix) {
                    matched = Some(rest.to_string());
                    break;
                }
            }
            matched.unwrap_or_else(|| {
                normalized
                    .split_once('/')
                    .map(|(_, b)| b.to_string())
                    .unwrap_or_else(|| normalized.to_string())
            })
        } else {
            normalized
                .split_once('/')
                .map(|(_, b)| b.to_string())
                .unwrap_or_else(|| normalized.to_string())
        };

        let local_ref = format!("refs/heads/{local_name}");
        if super::runner::read(root, &["show-ref", "--verify", &local_ref]).is_ok() {
            mutate(root, &["checkout", &local_name]).map(|_| ())
        } else {
            mutate(root, &["checkout", "--track", normalized]).map(|_| ())
        }
    } else {
        mutate(root, &["checkout", trimmed]).map(|_| ())
    }
}
pub fn create_branch(
    root: &Path,
    name: &str,
    start_point: Option<&str>,
    checkout: bool,
) -> GitResult<()> {
    if checkout {
        if let Some(start) = start_point {
            mutate(root, &["checkout", "-b", name, start]).map(|_| ())
        } else {
            mutate(root, &["checkout", "-b", name]).map(|_| ())
        }
    } else {
        if let Some(start) = start_point {
            mutate(root, &["branch", name, start]).map(|_| ())
        } else {
            mutate(root, &["branch", name]).map(|_| ())
        }
    }
}
pub fn merge_branch(root: &Path, branch: &str) -> GitResult<String> {
    merge_branch_with_strategy(root, branch, None)
}

pub fn merge_branch_with_strategy(
    root: &Path,
    branch: &str,
    strategy: Option<&str>,
) -> GitResult<String> {
    let out = match strategy {
        Some("no-ff") => mutate(root, &["merge", "--no-ff", "--no-edit", branch])?,
        Some("ff-only") => mutate(root, &["merge", "--ff-only", branch])?,
        _ => mutate(root, &["merge", "--no-edit", branch])?,
    };
    Ok(String::from_utf8_lossy(&out).into_owned())
}
pub fn delete_branch(root: &Path, branch: &str, force: bool) -> GitResult<()> {
    let mut trimmed = branch.trim();
    if let Some(stripped) = trimmed.strip_prefix("refs/heads/") {
        trimmed = stripped.trim();
    }
    if trimmed.starts_with("refs/tags/") || trimmed.starts_with("tag: ") {
        return delete_tag(root, trimmed, false, None);
    }
    let flag = if force { "-D" } else { "-d" };
    mutate(root, &["branch", flag, trimmed]).map(|_| ())
}
pub fn stash_push(
    root: &Path,
    message: Option<&str>,
    include_untracked: bool,
) -> GitResult<String> {
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("-u");
    }
    let msg_str;
    if let Some(msg) = message {
        let trimmed = msg.trim();
        if !trimmed.is_empty() {
            args.push("-m");
            msg_str = trimmed;
            args.push(msg_str);
        }
    }
    let out = mutate_no_literal(root, &args)?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}
fn resolve_stash_ref(root: &Path, stash_ref: Option<&str>) -> Option<String> {
    let r = stash_ref?.trim();
    if r.is_empty() || r == "stash" || r == "refs/stash" {
        return None;
    }
    if r.starts_with("stash@{") || r.chars().all(|c| c.is_ascii_digit()) {
        return Some(r.to_string());
    }
    if let Ok(out) = read(root, &["stash", "list", "--format=%H%x00%gd"]) {
        let s = String::from_utf8_lossy(&out);
        for line in s.lines() {
            let parts: Vec<&str> = line.split('\0').collect();
            if parts.len() == 2 {
                let oid = parts[0].trim();
                let ref_name = parts[1].trim();
                if oid.starts_with(r) || r.starts_with(oid) {
                    return Some(ref_name.to_string());
                }
            }
        }
    }
    Some(r.to_string())
}

pub fn stash_pop(root: &Path, stash_ref: Option<&str>) -> GitResult<String> {
    let mut args = vec!["stash", "pop"];
    let resolved = resolve_stash_ref(root, stash_ref);
    if let Some(ref r) = resolved {
        args.push(r.as_str());
    }
    let out = mutate(root, &args)?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}
pub fn stash_apply(root: &Path, stash_ref: Option<&str>) -> GitResult<String> {
    let mut args = vec!["stash", "apply"];
    let resolved = resolve_stash_ref(root, stash_ref);
    if let Some(ref r) = resolved {
        args.push(r.as_str());
    }
    let out = mutate(root, &args)?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}
pub fn stash_drop(root: &Path, stash_ref: Option<&str>) -> GitResult<String> {
    let mut args = vec!["stash", "drop"];
    let resolved = resolve_stash_ref(root, stash_ref);
    if let Some(ref r) = resolved {
        args.push(r.as_str());
    }
    let out = mutate(root, &args)?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}
pub fn cherry_pick(root: &Path, oid: &str) -> GitResult<String> {
    let out = mutate(root, &["cherry-pick", oid.trim()])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}
pub fn delete_remote_branch(root: &Path, full_ref: &str) -> GitResult<()> {
    let trimmed = full_ref.trim();
    let (remote, branch) = if let Some(idx) = trimmed.find('/') {
        (&trimmed[..idx], &trimmed[idx + 1..])
    } else {
        ("origin", trimmed)
    };
    mutate(root, &["push", remote, "--delete", branch]).map(|_| ())
}
pub fn reset_head(root: &Path, oid: &str, mode: &str) -> GitResult<String> {
    let mode_flag = match mode.trim().to_ascii_lowercase().as_str() {
        "soft" => "--soft",
        "hard" => "--hard",
        _ => "--mixed",
    };
    let out = mutate(root, &["reset", mode_flag, oid.trim()])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn discard_file(root: &Path, file: &ChangedFile) -> GitResult<()> {
    if file.status == FileStatus::Untracked {
        let full_path = root.join(&file.path);
        if full_path.is_dir() {
            std::fs::remove_dir_all(&full_path).map_err(|e| GitError {
                category: GitErrorCategory::Io,
                message: format!("Falha ao excluir diretório {}", file.path.display()),
                details: Some(e.to_string()),
            })?;
        } else if full_path.exists() {
            std::fs::remove_file(&full_path).map_err(|e| GitError {
                category: GitErrorCategory::Io,
                message: format!("Falha ao excluir arquivo {}", file.path.display()),
                details: Some(e.to_string()),
            })?;
        }
        Ok(())
    } else {
        mutate_os(
            root,
            &[
                OsStr::new("checkout"),
                OsStr::new("--"),
                file.path.as_os_str(),
            ],
        )
        .map(|_| ())
    }
}

pub fn discard_all_unstaged(root: &Path) -> GitResult<()> {
    let _ = mutate(root, &["checkout", "--", "."]);
    mutate(root, &["clean", "-fd"])?;
    Ok(())
}

pub fn revert_commit(root: &Path, oid: &str) -> GitResult<String> {
    let out = mutate(root, &["revert", "--no-edit", oid.trim()])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn create_tag(
    root: &Path,
    name: &str,
    oid: Option<&str>,
    message: Option<&str>,
    force: bool,
) -> GitResult<String> {
    let mut trimmed_name = name.trim();
    if let Some(stripped) = trimmed_name.strip_prefix("tag: ") {
        trimmed_name = stripped.trim();
    }
    if let Some(stripped) = trimmed_name.strip_prefix("refs/tags/") {
        trimmed_name = stripped.trim();
    }
    if trimmed_name.is_empty() {
        return Err(GitError {
            category: GitErrorCategory::Process,
            message: "Nome da tag não pode ser vazio".into(),
            details: None,
        });
    }
    let mut args = vec!["tag"];
    if force {
        args.push("-f");
    }
    let msg_str;
    if let Some(msg) = message {
        let trimmed_msg = msg.trim();
        if !trimmed_msg.is_empty() {
            args.push("-a");
            args.push(trimmed_name);
            args.push("-m");
            msg_str = trimmed_msg;
            args.push(msg_str);
        } else {
            args.push(trimmed_name);
        }
    } else {
        args.push(trimmed_name);
    }
    if let Some(o) = oid {
        let trimmed_oid = o.trim();
        if !trimmed_oid.is_empty() {
            args.push(trimmed_oid);
        }
    }
    let out = mutate_no_literal(root, &args)?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn delete_tag(
    root: &Path,
    name: &str,
    delete_remote: bool,
    remote: Option<&str>,
) -> GitResult<()> {
    let mut trimmed = name.trim();
    let parsed_name;
    if trimmed.starts_with('{') {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if let Some(n) = val.get("name").and_then(|v| v.as_str()) {
                parsed_name = n.to_string();
                trimmed = &parsed_name;
            }
        }
    }
    if let Some(stripped) = trimmed.strip_prefix("tag: ") {
        trimmed = stripped.trim();
    }
    if let Some(stripped) = trimmed.strip_prefix("refs/tags/") {
        trimmed = stripped.trim();
    }
    if trimmed.is_empty() {
        return Err(GitError {
            category: GitErrorCategory::Process,
            message: "Nome da tag não pode ser vazio".into(),
            details: None,
        });
    }
    let local_result = mutate(root, &["tag", "-d", trimmed]);
    let mut remote_err = None;
    if delete_remote {
        let remote_name = if let Some(r) = remote.map(str::trim).filter(|r| !r.is_empty()) {
            r.to_string()
        } else if let Ok(remotes_out) = super::runner::read(root, &["remote"]) {
            let remotes_str = String::from_utf8_lossy(&remotes_out);
            let first = remotes_str
                .lines()
                .map(str::trim)
                .find(|s| !s.is_empty())
                .map(str::to_string);
            if remotes_str.lines().map(str::trim).any(|s| s == "origin") {
                "origin".to_string()
            } else {
                first.unwrap_or_else(|| "origin".to_string())
            }
        } else {
            "origin".to_string()
        };
        let ref_spec = format!(":refs/tags/{trimmed}");
        if let Err(e) = mutate(root, &["push", &remote_name, &ref_spec]) {
            remote_err = Some(e);
        }
    }
    match local_result {
        Ok(_) => {
            if let Some(err) = remote_err {
                Err(err)
            } else {
                Ok(())
            }
        }
        Err(err) => {
            let msg = err.message.to_lowercase();
            let details = err.details.as_deref().unwrap_or("").to_lowercase();
            let is_not_found = msg.contains("not found")
                || msg.contains("não encontrada")
                || details.contains("not found")
                || details.contains("não encontrada");
            if is_not_found && delete_remote && remote_err.is_none() {
                Ok(())
            } else if let Some(r_err) = remote_err {
                Err(r_err)
            } else {
                Err(err)
            }
        }
    }
}

pub fn push_tag(root: &Path, tag: &str, remote: Option<&str>, force: bool) -> GitResult<String> {
    let mut trimmed = tag.trim();
    if let Some(stripped) = trimmed.strip_prefix("tag: ") {
        trimmed = stripped.trim();
    }
    if let Some(stripped) = trimmed.strip_prefix("refs/tags/") {
        trimmed = stripped.trim();
    }
    if trimmed.is_empty() {
        return Err(GitError {
            category: GitErrorCategory::Process,
            message: "Nome da tag não pode ser vazio".into(),
            details: None,
        });
    }
    let remote_name = if let Some(r) = remote.map(str::trim).filter(|r| !r.is_empty()) {
        r.to_string()
    } else if let Ok(remotes_out) = super::runner::read(root, &["remote"]) {
        let remotes_str = String::from_utf8_lossy(&remotes_out);
        let first = remotes_str
            .lines()
            .map(str::trim)
            .find(|s| !s.is_empty())
            .map(str::to_string);
        if remotes_str.lines().map(str::trim).any(|s| s == "origin") {
            "origin".to_string()
        } else {
            first.unwrap_or_else(|| "origin".to_string())
        }
    } else {
        "origin".to_string()
    };

    let mut args = vec!["push", &remote_name];
    let ref_spec;
    if trimmed == "--tags" || trimmed == "all" {
        args.push("--tags");
    } else {
        ref_spec = format!("refs/tags/{trimmed}");
        args.push(&ref_spec);
    }
    if force {
        args.push("--force");
    }
    let out = mutate(root, &args)?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn rebase(root: &Path, target: &str) -> GitResult<String> {
    let out = mutate(root, &["rebase", target.trim()])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn rebase_continue(root: &Path) -> GitResult<String> {
    let out = mutate(root, &["rebase", "--continue"])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn rebase_abort(root: &Path) -> GitResult<String> {
    let out = mutate(root, &["rebase", "--abort"])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn rebase_skip(root: &Path) -> GitResult<String> {
    let out = mutate(root, &["rebase", "--skip"])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn merge_abort(root: &Path) -> GitResult<String> {
    let out = mutate(root, &["merge", "--abort"])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn merge_squash(root: &Path, branch: &str) -> GitResult<String> {
    let out = mutate(root, &["merge", "--squash", branch.trim()])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn cherry_pick_abort(root: &Path) -> GitResult<String> {
    let out = mutate(root, &["cherry-pick", "--abort"])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn cherry_pick_continue(root: &Path) -> GitResult<String> {
    let out = mutate(root, &["cherry-pick", "--continue"])?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn detect_in_progress(git_dir: &Path) -> Option<InProgressOp> {
    if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        let head_name = std::fs::read_to_string(git_dir.join("rebase-merge").join("head-name"))
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        return Some(InProgressOp {
            kind: InProgressKind::Rebase,
            message: head_name,
        });
    }
    if git_dir.join("MERGE_HEAD").exists() {
        let msg = std::fs::read_to_string(git_dir.join("MERGE_MSG"))
            .ok()
            .map(|s| s.lines().next().unwrap_or("").trim().to_string())
            .filter(|s| !s.is_empty());
        return Some(InProgressOp {
            kind: InProgressKind::Merge,
            message: msg,
        });
    }
    if git_dir.join("CHERRY_PICK_HEAD").exists() {
        let msg = std::fs::read_to_string(git_dir.join("MERGE_MSG"))
            .ok()
            .map(|s| s.lines().next().unwrap_or("").trim().to_string())
            .filter(|s| !s.is_empty());
        return Some(InProgressOp {
            kind: InProgressKind::CherryPick,
            message: msg,
        });
    }
    if git_dir.join("REVERT_HEAD").exists() {
        return Some(InProgressOp {
            kind: InProgressKind::Revert,
            message: None,
        });
    }
    None
}

pub fn no_commit_error() -> GitError {
    GitError {
        category: GitErrorCategory::Process,
        message: "Nenhum commit para comparar".into(),
        details: None,
    }
}

pub fn clone_repository(source: &str, destination: &Path) -> GitResult<()> {
    let source = source.trim();
    if source.is_empty() {
        return Err(GitError {
            category: GitErrorCategory::Process,
            message: "A origem do repositório é obrigatória".into(),
            details: None,
        });
    }
    if let Some(parent) = destination.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| GitError {
                category: GitErrorCategory::Io,
                message: "Não foi possível criar o diretório pai".into(),
                details: Some(e.to_string()),
            })?;
        }
    }
    let parent_dir = destination
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(destination);
    let args = [
        OsStr::new("clone"),
        OsStr::new("--"),
        OsStr::new(source),
        destination.as_os_str(),
    ];
    mutate_os_no_literal(parent_dir, &args).map(|_| ())
}

pub fn init_repository(path: &Path, default_branch: Option<&str>) -> GitResult<()> {
    std::fs::create_dir_all(path).map_err(|e| GitError {
        category: GitErrorCategory::Io,
        message: "Não foi possível criar o diretório do repositório".into(),
        details: Some(e.to_string()),
    })?;
    let mut args = vec![OsStr::new("init")];
    let branch_str;
    if let Some(branch) = default_branch.map(str::trim).filter(|b| !b.is_empty()) {
        branch_str = branch;
        args.push(OsStr::new("-b"));
        args.push(OsStr::new(branch_str));
    }
    mutate_os_no_literal(path, &args).map(|_| ())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PatchTarget {
    Stage,
    Unstage,
    Discard,
}

pub fn apply_patch(root: &Path, patch: &str, target: PatchTarget) -> GitResult<()> {
    let args: &[&str] = match target {
        PatchTarget::Stage => &[
            "apply",
            "--cached",
            "--ignore-whitespace",
            "--whitespace=nowarn",
            "--unidiff-zero",
            "--recount",
            "-",
        ],
        PatchTarget::Unstage => &[
            "apply",
            "--cached",
            "--reverse",
            "--ignore-whitespace",
            "--whitespace=nowarn",
            "--unidiff-zero",
            "--recount",
            "-",
        ],
        PatchTarget::Discard => &[
            "apply",
            "--reverse",
            "--ignore-whitespace",
            "--whitespace=nowarn",
            "--unidiff-zero",
            "--recount",
            "-",
        ],
    };
    let mut patch_bytes = patch.as_bytes().to_vec();
    if !patch_bytes.is_empty() && !patch_bytes.ends_with(b"\n") {
        patch_bytes.push(b'\n');
    }
    super::runner::mutate_with_stdin(root, args, &patch_bytes).map(|_| ())
}

pub fn add_to_gitignore(root: &Path, pattern: &str) -> GitResult<()> {
    let gitignore_path = root.join(".gitignore");
    let mut content = if gitignore_path.exists() {
        std::fs::read_to_string(&gitignore_path).unwrap_or_default()
    } else {
        String::new()
    };
    let pattern = pattern.trim();
    for line in content.lines() {
        if line.trim() == pattern {
            return Ok(());
        }
    }
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(pattern);
    content.push('\n');
    std::fs::write(&gitignore_path, content).map_err(|e| GitError {
        category: GitErrorCategory::Io,
        message: "Falha ao gravar no arquivo .gitignore".into(),
        details: Some(e.to_string()),
    })?;
    Ok(())
}

pub fn open_terminal(root: &Path, custom_terminal: Option<&str>) -> GitResult<()> {
    let custom = custom_terminal
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "default");

    #[cfg(target_os = "windows")]
    {
        if let Some(term) = custom {
            let _ = std::process::Command::new("cmd")
                .args(["/c", "start", term])
                .current_dir(root)
                .spawn();
            return Ok(());
        }
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "wt", "-d", "."])
            .current_dir(root)
            .spawn()
            .or_else(|_| {
                std::process::Command::new("cmd")
                    .args(["/c", "start", "powershell"])
                    .current_dir(root)
                    .spawn()
            })
            .or_else(|_| {
                std::process::Command::new("cmd")
                    .args(["/c", "start", "cmd"])
                    .current_dir(root)
                    .spawn()
            });
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(term) = custom {
            let _ = std::process::Command::new("open")
                .args(["-a", term])
                .arg(root)
                .spawn();
            return Ok(());
        }
        let _ = std::process::Command::new("open")
            .args(["-a", "Terminal"])
            .arg(root)
            .spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(term) = custom {
            let parts: Vec<&str> = term.split_whitespace().collect();
            if !parts.is_empty() {
                let bin = parts[0];
                let extra_args = &parts[1..];
                let mut cmd = std::process::Command::new(bin);
                cmd.args(extra_args).current_dir(root);
                if bin == "gnome-terminal" && extra_args.is_empty() {
                    cmd.arg(format!("--working-directory={}", root.display()));
                }
                if cmd.spawn().is_ok() {
                    return Ok(());
                }
            }
        }

        let terminals = [
            "ghostty",
            "x-terminal-emulator",
            "gnome-terminal",
            "kitty",
            "alacritty",
            "konsole",
            "xfce4-terminal",
            "wezterm",
            "xterm",
        ];
        let mut spawned = false;
        if let Ok(term) = std::env::var("TERMINAL") {
            if std::process::Command::new(&term)
                .current_dir(root)
                .spawn()
                .is_ok()
            {
                spawned = true;
            }
        }
        if !spawned {
            for term in terminals {
                let mut cmd = std::process::Command::new(term);
                cmd.current_dir(root);
                if term == "gnome-terminal" {
                    cmd.arg(format!("--working-directory={}", root.display()));
                }
                if cmd.spawn().is_ok() {
                    break;
                }
            }
        }
    }
    Ok(())
}

pub fn open_editor(root: &Path, rel_path: Option<&str>) -> GitResult<()> {
    let target = match rel_path {
        Some(p) => root.join(p),
        None => root.to_path_buf(),
    };
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/c", "code", target.to_str().unwrap_or(".")])
            .current_dir(root)
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("code")
            .arg(&target)
            .current_dir(root)
            .spawn();
    }
    Ok(())
}

pub fn reveal_file(root: &Path, rel_path: &str) -> GitResult<()> {
    let target = root.join(rel_path);
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", target.display()))
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&target)
            .spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = if target.is_dir() {
            target
        } else {
            target.parent().unwrap_or(root).to_path_buf()
        };
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

pub fn open_browser(url: &str) -> GitResult<()> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", trimmed])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(trimmed).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(trimmed).spawn();
    }
    Ok(())
}

pub fn restore_file_from_commit(root: &Path, commit_oid: &str, path: &Path) -> GitResult<()> {
    mutate_os(
        root,
        &[
            OsStr::new("checkout"),
            OsStr::new(commit_oid.trim()),
            OsStr::new("--"),
            path.as_os_str(),
        ],
    )
    .map(|_| ())
}

pub fn commit_details(root: &Path, oid: &str) -> GitResult<CommitDetails> {
    let raw = read(
        root,
        &[
            "show",
            "-s",
            "--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%s%x00%b%x00%D",
            oid,
        ],
    )?;
    let s = String::from_utf8_lossy(&raw);
    let parts: Vec<&str> = s.split('\0').collect();
    if parts.len() >= 10 {
        let full_oid = parts[0].trim().to_string();
        let parents = parts[1]
            .split_whitespace()
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect();
        let author_name = parts[2].trim().to_string();
        let author_email = parts[3].trim().to_string();
        let author_timestamp = parts[4].trim().parse::<i64>().unwrap_or(0);
        let committer_name = parts[5].trim().to_string();
        let committer_email = parts[6].trim().to_string();
        let committer_timestamp = parts[7].trim().parse::<i64>().unwrap_or(0);
        let subject = parts[8].trim().to_string();
        let body = parts[9].trim_end().to_string();
        let refs = if parts.len() > 10 {
            parts[10]
                .split(',')
                .map(|r| r.trim().to_string())
                .filter(|r| !r.is_empty())
                .collect()
        } else {
            Vec::new()
        };
        Ok(CommitDetails {
            oid: full_oid,
            parents,
            refs,
            author_name,
            author_email,
            author_timestamp,
            committer_name,
            committer_email,
            committer_timestamp,
            subject,
            body,
        })
    } else {
        Err(GitError {
            category: GitErrorCategory::Parse,
            message: format!("Não foi possível obter detalhes do commit {}", oid),
            details: None,
        })
    }
}

pub fn file_blame(
    root: &Path,
    rel_path: &str,
    commit_oid: Option<&str>,
) -> GitResult<Vec<BlameLine>> {
    let mut args = vec!["blame", "--line-porcelain"];
    if let Some(oid) = commit_oid {
        args.push(oid);
    }
    args.push("--");
    args.push(rel_path);

    let raw = match read(root, &args) {
        Ok(out) => out,
        Err(_) => return Ok(Vec::new()),
    };

    let text = String::from_utf8_lossy(&raw);
    let mut lines = Vec::new();

    let mut current_hash = String::new();
    let mut current_line_num: usize = 0;
    let mut current_author = String::new();
    let mut current_author_mail = String::new();
    let mut current_author_time: i64 = 0;
    let mut current_summary = String::new();

    for line in text.lines() {
        if line.starts_with('\t') {
            lines.push(BlameLine {
                line_number: current_line_num,
                commit_oid: current_hash.clone(),
                author: current_author.clone(),
                author_mail: current_author_mail.clone(),
                author_timestamp: current_author_time,
                summary: current_summary.clone(),
            });
        } else if let Some(author) = line.strip_prefix("author ") {
            current_author = author.trim().to_string();
        } else if let Some(mail) = line.strip_prefix("author-mail ") {
            current_author_mail = mail.trim().trim_matches(&['<', '>'][..]).to_string();
        } else if let Some(time_str) = line.strip_prefix("author-time ") {
            current_author_time = time_str.trim().parse::<i64>().unwrap_or(0);
        } else if let Some(summary) = line.strip_prefix("summary ") {
            current_summary = summary.trim().to_string();
        } else {
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if tokens.len() >= 3 && tokens[0].len() == 40 {
                current_hash = tokens[0].to_string();
                if let Ok(final_line) = tokens[2].parse::<usize>() {
                    current_line_num = final_line;
                }
            }
        }
    }

    Ok(lines)
}

pub fn file_history(
    root: &Path,
    rel_path: &str,
    max_count: usize,
) -> GitResult<Vec<FileHistoryEntry>> {
    let count_str = max_count.to_string();
    let raw = match read(
        root,
        &[
            "log",
            "--follow",
            "--format=%H%x1f%an%x1f%ae%x1f%at%x1f%s",
            "-n",
            &count_str,
            "--",
            rel_path,
        ],
    ) {
        Ok(out) => out,
        Err(_) => return Ok(Vec::new()),
    };

    let text = String::from_utf8_lossy(&raw);
    let mut entries = Vec::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() >= 5 {
            entries.push(FileHistoryEntry {
                oid: parts[0].trim().to_string(),
                author: parts[1].trim().to_string(),
                email: parts[2].trim().to_string(),
                timestamp: parts[3].trim().parse::<i64>().unwrap_or(0),
                summary: parts[4].trim().to_string(),
            });
        }
    }
    Ok(entries)
}

pub fn reflog(root: &Path, max_count: usize) -> GitResult<Vec<ReflogEntry>> {
    let count_str = max_count.to_string();
    let raw = match read(
        root,
        &[
            "reflog",
            "show",
            "--format=%H%x1f%gD%x1f%gs%x1f%at%x1f%an",
            "-n",
            &count_str,
        ],
    ) {
        Ok(out) => out,
        Err(_) => return Ok(Vec::new()),
    };

    let text = String::from_utf8_lossy(&raw);
    let mut entries = Vec::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() >= 5 {
            entries.push(ReflogEntry {
                oid: parts[0].trim().to_string(),
                selector: parts[1].trim().to_string(),
                action: parts[2].trim().to_string(),
                timestamp: parts[3].trim().parse::<i64>().unwrap_or(0),
                author: parts[4].trim().to_string(),
            });
        }
    }
    Ok(entries)
}

pub fn get_remotes(root: &Path) -> GitResult<Vec<RemoteEntry>> {
    let raw = match read(root, &["remote", "-v"]) {
        Ok(out) => out,
        Err(_) => return Ok(Vec::new()),
    };
    let text = String::from_utf8_lossy(&raw);
    let mut map: std::collections::BTreeMap<String, (String, String)> =
        std::collections::BTreeMap::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            let name = parts[0].to_string();
            let url = parts[1].to_string();
            let kind = parts[2];
            let entry = map
                .entry(name)
                .or_insert_with(|| (String::new(), String::new()));
            if kind.contains("fetch") {
                entry.0 = url;
            } else if kind.contains("push") {
                entry.1 = url;
            }
        }
    }
    let mut result = Vec::new();
    for (name, (fetch_url, push_url)) in map {
        let f = if fetch_url.is_empty() {
            push_url.clone()
        } else {
            fetch_url
        };
        let p = if push_url.is_empty() {
            f.clone()
        } else {
            push_url
        };
        result.push(RemoteEntry {
            name,
            fetch_url: f,
            push_url: p,
        });
    }
    Ok(result)
}

pub fn add_remote(root: &Path, name: &str, url: &str) -> GitResult<()> {
    mutate(root, &["remote", "add", name.trim(), url.trim()]).map(|_| ())
}

pub fn remove_remote(root: &Path, name: &str) -> GitResult<()> {
    mutate(root, &["remote", "remove", name.trim()]).map(|_| ())
}

pub fn set_remote_url(root: &Path, name: &str, url: &str) -> GitResult<()> {
    mutate(root, &["remote", "set-url", name.trim(), url.trim()]).map(|_| ())
}

pub fn fetch_prune(root: &Path, remote: Option<&str>) -> GitResult<String> {
    let mut args = vec!["fetch", "--prune"];
    if let Some(r) = remote.filter(|s| !s.trim().is_empty()) {
        args.push(r.trim());
    } else {
        args.push("--all");
    }
    let out = mutate(root, &args)?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

pub fn resolve_conflict(root: &Path, rel_path: &str, choice: &str) -> GitResult<()> {
    let trimmed_choice = choice.trim().to_lowercase();
    match trimmed_choice.as_str() {
        "ours" => {
            mutate(root, &["checkout", "--ours", "--", rel_path])?;
            mutate(root, &["add", "--", rel_path])?;
        }
        "theirs" => {
            mutate(root, &["checkout", "--theirs", "--", rel_path])?;
            mutate(root, &["add", "--", rel_path])?;
        }
        "both" => {
            let full_path = root.join(rel_path);
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                let mut resolved = Vec::new();
                for line in content.lines() {
                    if line.starts_with("<<<<<<<")
                        || line.starts_with("=======")
                        || line.starts_with(">>>>>>>")
                    {
                        continue;
                    }
                    resolved.push(line);
                }
                let mut new_text = resolved.join("\n");
                if content.ends_with('\n') {
                    new_text.push('\n');
                }
                let _ = std::fs::write(&full_path, new_text);
            }
            mutate(root, &["add", "--", rel_path])?;
        }
        "mark_resolved" | "add" => {
            mutate(root, &["add", "--", rel_path])?;
        }
        _ => {
            return Err(GitError {
                category: GitErrorCategory::Process,
                message: format!("Estratégia de resolução desconhecida: {choice}"),
                details: None,
            });
        }
    }
    Ok(())
}
