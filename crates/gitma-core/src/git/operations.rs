use super::runner::{mutate, mutate_no_literal, mutate_os, mutate_os_no_literal, read};
use crate::domain::{
    ChangedFile, FileStatus, GitError, GitErrorCategory, GitResult, InProgressKind, InProgressOp,
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
    mutate(root, &["pull", "--ff-only"]).map(|_| ())
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
    let out = mutate(root, &["merge", "--no-edit", branch])?;
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
        let remote_name = remote.unwrap_or("origin").trim();
        let ref_spec = format!(":refs/tags/{trimmed}");
        if let Err(e) = mutate(root, &["push", remote_name, &ref_spec]) {
            remote_err = Some(e);
        }
    }
    match local_result {
        Ok(_) => Ok(()),
        Err(err) => {
            let msg = err.message.to_lowercase();
            let details = err.details.as_deref().unwrap_or("").to_lowercase();
            let is_not_found = msg.contains("not found")
                || msg.contains("não encontrada")
                || details.contains("not found")
                || details.contains("não encontrada");
            if is_not_found && delete_remote && remote_err.is_none() {
                Ok(())
            } else {
                Err(err)
            }
        }
    }
}

pub fn push_tag(root: &Path, tag: &str, remote: Option<&str>) -> GitResult<String> {
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

    let out = if trimmed == "--tags" || trimmed == "all" {
        mutate(root, &["push", &remote_name, "--tags"])?
    } else {
        let ref_spec = format!("refs/tags/{trimmed}");
        mutate(root, &["push", &remote_name, &ref_spec])?
    };
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
