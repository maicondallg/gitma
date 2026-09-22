pub mod diff;
pub mod history;
pub mod operations;
pub mod runner;
pub mod status;

use crate::domain::*;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// Git service backed by the installed `git` executable.
#[derive(Clone, Debug)]
pub struct GitRepository {
    context: RepoContext,
}
impl GitRepository {
    pub fn open(path: impl AsRef<Path>) -> GitResult<Self> {
        let p = path.as_ref().canonicalize().map_err(|e| GitError {
            category: GitErrorCategory::Io,
            message: "Não foi possível abrir o caminho".into(),
            details: Some(e.to_string()),
        })?;
        let root = path_from_git_output(runner::read(&p, &["rev-parse", "--show-toplevel"])?)?;
        Ok(Self {
            context: RepoContext {
                root,
                generation: 0,
            },
        })
    }
    pub fn from_context(context: RepoContext) -> Self {
        Self { context }
    }
    pub fn snapshot(&self) -> GitResult<RepoSnapshot> {
        let raw = runner::read(
            &self.context.root,
            &["status", "--porcelain=v1", "--untracked-files=all", "-z"],
        )?;
        let (mut staged, mut unstaged, conflicted) = status::parse_porcelain_z(&raw);

        if !staged.is_empty() {
            if let Ok(staged_numstat) = runner::read(
                &self.context.root,
                &["diff", "--cached", "--numstat", "-M", "-z"],
            ) {
                let numstat_map = status::parse_numstat_z(&staged_numstat);
                for f in &mut staged {
                    if let Some(stat) = numstat_map
                        .get(&f.path)
                        .or_else(|| f.old_path.as_ref().and_then(|op| numstat_map.get(op)))
                    {
                        f.insertions = stat.insertions;
                        f.deletions = stat.deletions;
                        f.is_binary = stat.is_binary;
                    }
                }
            }
        }

        if !unstaged.is_empty() {
            if let Ok(unstaged_numstat) = runner::read(
                &self.context.root,
                &["diff", "--numstat", "-M", "-z"],
            ) {
                let numstat_map = status::parse_numstat_z(&unstaged_numstat);
                for f in &mut unstaged {
                    if let Some(stat) = numstat_map
                        .get(&f.path)
                        .or_else(|| f.old_path.as_ref().and_then(|op| numstat_map.get(op)))
                    {
                        f.insertions = stat.insertions;
                        f.deletions = stat.deletions;
                        f.is_binary = stat.is_binary;
                    } else if f.status == FileStatus::Untracked {
                        let full_path = self.context.root.join(&f.path);
                        if let Ok(metadata) = std::fs::metadata(&full_path) {
                            if metadata.is_file() && metadata.len() <= diff::DEFAULT_MAX_BYTES as u64 {
                                if let Ok(content) = std::fs::read(&full_path) {
                                    if !content.contains(&0) {
                                        let lines = content.iter().filter(|&&b| b == b'\n').count();
                                        f.insertions = Some(lines + if !content.is_empty() && !content.ends_with(b"\n") { 1 } else { 0 });
                                        f.deletions = Some(0);
                                    } else {
                                        f.is_binary = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let branch = runner::read(
            &self.context.root,
            &["symbolic-ref", "--short", "-q", "HEAD"],
        )
        .map(|bytes| String::from_utf8_lossy(&bytes).trim().to_owned())
        .unwrap_or_default(); // A detached HEAD is a normal repository state.
        let upstream = match runner::read(
            &self.context.root,
            &[
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{upstream}",
            ],
        ) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).trim().to_owned(),
            Err(_) => String::new(),
        };
        let (ahead, behind) = if !upstream.is_empty() {
            if let Ok(out) = runner::read(
                &self.context.root,
                &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
            ) {
                let text = String::from_utf8_lossy(&out);
                let parts: Vec<&str> = text.split_whitespace().collect();
                if parts.len() == 2 {
                    let a = parts[0].parse::<usize>().ok();
                    let b = parts[1].parse::<usize>().ok();
                    (a, b)
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };
        let in_progress = self
            .git_dir()
            .ok()
            .as_deref()
            .and_then(operations::detect_in_progress);
        Ok(RepoSnapshot {
            branch: (!branch.is_empty()).then_some(branch),
            upstream: (!upstream.is_empty()).then_some(upstream),
            ahead,
            behind,
            staged,
            unstaged,
            conflicted,
            in_progress,
        })
    }
    pub fn history(&self, page_no: usize, page_size: usize) -> GitResult<HistoryPage> {
        self.history_scoped(page_no, page_size, true)
    }
    pub fn history_scoped(&self, page_no: usize, page_size: usize, all_branches: bool) -> GitResult<HistoryPage> {
        let n = page_size.saturating_add(16).to_string();
        let skip = page_no.saturating_mul(page_size).to_string();
        let head_exists =
            runner::read(&self.context.root, &["rev-parse", "--verify", "HEAD"]).is_ok();
        let mut stash_map = std::collections::HashMap::new();
        let mut stash_refs = Vec::new();
        if let Ok(out) = runner::read(&self.context.root, &["stash", "list", "--format=%H%x00%gd"])
        {
            let s = String::from_utf8_lossy(&out);
            for line in s.lines() {
                let parts: Vec<&str> = line.split('\0').collect();
                if parts.len() == 2 {
                    let oid = parts[0].trim().to_string();
                    let sref = parts[1].trim().to_string();
                    if !oid.is_empty() && !sref.is_empty() {
                        stash_refs.push(sref.clone());
                        stash_map.insert(oid, sref);
                    }
                }
            }
        }

        let mut args = vec!["log"];
        if all_branches {
            args.push("--all");
        } else if head_exists {
            args.push("HEAD");
        }
        for sref in &stash_refs {
            args.push(sref.as_str());
        }
        args.extend_from_slice(&[
            "--date-order",
            "-z",
            "--pretty=tformat:%H%x00%P%x00%an%x00%at%x00%s%x00%D",
            "--max-count",
            &n,
            "--skip",
            &skip,
        ]);
        // A detached commit may no longer be pointed to by a ref. Include
        // HEAD explicitly, but avoid naming it in an unborn repository.
        if all_branches && head_exists {
            args.insert(2, "HEAD");
        }
        Ok(history::page(
            history::parse_log_with_stashes(&runner::read(&self.context.root, &args)?, &stash_map)?,
            page_size,
        ))
    }
    pub fn diff_local(&self, path: Option<&Path>, staged: bool) -> GitResult<FileDiff> {
        self.diff_local_paths(path, staged)
    }
    pub fn diff_selection(&self, selection: &FileSelection) -> GitResult<FileDiff> {
        let paths = selection
            .old_path
            .iter()
            .chain(std::iter::once(&selection.path))
            .map(PathBuf::as_path);
        match &selection.context {
            SelectionContext::LocalChanges => {
                self.diff_local_paths(paths, selection.area == FileArea::Staged)
            }
            SelectionContext::Commit { oid } => self.diff_commit_paths(oid, paths),
        }
    }

    fn diff_local_paths<'a>(
        &self,
        paths: impl IntoIterator<Item = &'a Path>,
        staged: bool,
    ) -> GitResult<FileDiff> {
        let mut args: Vec<&std::ffi::OsStr> = if staged {
            vec![
                std::ffi::OsStr::new("diff"),
                std::ffi::OsStr::new("--cached"),
                std::ffi::OsStr::new("--no-ext-diff"),
                std::ffi::OsStr::new("--"),
            ]
        } else {
            vec![
                std::ffi::OsStr::new("diff"),
                std::ffi::OsStr::new("--no-ext-diff"),
                std::ffi::OsStr::new("--"),
            ]
        };
        let owned: Vec<OsString> = paths
            .into_iter()
            .map(|value| value.as_os_str().to_owned())
            .collect();
        for value in &owned {
            args.push(value.as_os_str());
        }
        let parsed = diff::parse(
            &runner::read_os(&self.context.root, &args)?,
            diff::DEFAULT_MAX_BYTES,
        )?;
        if !staged && matches!(&parsed, FileDiff::Text { lines, .. } if lines.is_empty()) {
            if let Some(relative) = owned.first().map(PathBuf::from) {
                let snapshot = self.snapshot()?;
                if snapshot
                    .unstaged
                    .iter()
                    .any(|file| file.path == relative && file.status == FileStatus::Untracked)
                {
                    return diff::untracked(
                        &self.context.root.join(relative),
                        diff::DEFAULT_MAX_BYTES,
                    );
                }
            }
        }
        Ok(parsed)
    }
    pub fn diff_commit(&self, oid: &str, path: Option<&Path>) -> GitResult<FileDiff> {
        self.diff_commit_paths(oid, path)
    }

    fn diff_commit_paths<'a>(
        &self,
        oid: &str,
        paths: impl IntoIterator<Item = &'a Path>,
    ) -> GitResult<FileDiff> {
        // --root compares a root commit with the empty tree.  Explicit merge
        // mode makes a merge compare only with its first parent.
        let mut args = vec![
            std::ffi::OsStr::new("diff-tree"),
            std::ffi::OsStr::new("--root"),
            std::ffi::OsStr::new("--diff-merges=first-parent"),
            std::ffi::OsStr::new("-p"),
            std::ffi::OsStr::new("--no-ext-diff"),
            std::ffi::OsStr::new(oid),
            std::ffi::OsStr::new("--"),
        ];
        let owned: Vec<OsString> = paths
            .into_iter()
            .map(|value| value.as_os_str().to_owned())
            .collect();
        for value in &owned {
            args.push(value.as_os_str());
        }
        diff::parse(
            &runner::read_os(&self.context.root, &args)?,
            diff::DEFAULT_MAX_BYTES,
        )
    }
    pub fn files_for_commit(&self, oid: &str) -> GitResult<Vec<ChangedFile>> {
        let raw = runner::read(
            &self.context.root,
            &[
                "diff-tree",
                "--root",
                "--diff-merges=first-parent",
                "--no-commit-id",
                "--name-status",
                "-M",
                "-C",
                "-r",
                "-z",
                oid,
            ],
        )?;
        let mut files = status::parse_commit_names(&raw);

        if let Ok(numstat_raw) = runner::read(
            &self.context.root,
            &[
                "diff-tree",
                "--root",
                "--diff-merges=first-parent",
                "--no-commit-id",
                "--numstat",
                "-M",
                "-C",
                "-r",
                "-z",
                oid,
            ],
        ) {
            let numstat_map = status::parse_numstat_z(&numstat_raw);
            for f in &mut files {
                if let Some(stat) = numstat_map
                    .get(&f.path)
                    .or_else(|| f.old_path.as_ref().and_then(|op| numstat_map.get(op)))
                {
                    f.insertions = stat.insertions;
                    f.deletions = stat.deletions;
                    f.is_binary = stat.is_binary;
                }
            }
        }

        Ok(files)
    }
    pub fn files_between_commits(&self, base_oid: &str, target_oid: &str) -> GitResult<Vec<ChangedFile>> {
        let rev_range = format!("{}..{}", base_oid.trim(), target_oid.trim());
        let raw = runner::read(
            &self.context.root,
            &[
                "diff-tree",
                "--no-commit-id",
                "--name-status",
                "-M",
                "-C",
                "-r",
                "-z",
                base_oid.trim(),
                target_oid.trim(),
            ],
        )?;
        let mut files = status::parse_commit_names(&raw);

        if let Ok(numstat_raw) = runner::read(
            &self.context.root,
            &[
                "diff",
                "--numstat",
                "-M",
                "-C",
                "-z",
                &rev_range,
            ],
        ) {
            let numstat_map = status::parse_numstat_z(&numstat_raw);
            for f in &mut files {
                if let Some(stat) = numstat_map
                    .get(&f.path)
                    .or_else(|| f.old_path.as_ref().and_then(|op| numstat_map.get(op)))
                {
                    f.insertions = stat.insertions;
                    f.deletions = stat.deletions;
                    f.is_binary = stat.is_binary;
                }
            }
        }

        Ok(files)
    }
    pub fn first_parent(&self, oid: &str) -> GitResult<Option<String>> {
        let raw = runner::read(&self.context.root, &["show", "-s", "--format=%P", oid])?;
        Ok(String::from_utf8_lossy(&raw)
            .split_whitespace()
            .next()
            .map(str::to_owned))
    }
    pub fn git_dir(&self) -> GitResult<PathBuf> {
        let raw = runner::read(&self.context.root, &["rev-parse", "--git-dir"])?;
        let dir = path_from_git_output(raw)?;
        Ok(if dir.is_absolute() {
            dir
        } else {
            self.context.root.join(dir)
        })
    }
    pub fn history_key(&self) -> GitResult<String> {
        use sha2::{Digest, Sha256};
        let mut data = runner::read(&self.context.root, &["show-ref", "--head", "--dereference"])
            .unwrap_or_default();
        data.extend(
            runner::read(&self.context.root, &["rev-parse", "--verify", "HEAD"])
                .unwrap_or_default(),
        );
        data.extend(
            runner::read(&self.context.root, &["symbolic-ref", "-q", "HEAD"]).unwrap_or_default(),
        );
        Ok(format!("{:x}", Sha256::digest(data)))
    }
    pub fn index_content(&self, path: &Path) -> GitResult<Option<Vec<u8>>> {
        self.show_spec(&index_spec(path))
    }
    pub fn revision_content(&self, revision: &str, path: &Path) -> GitResult<Option<Vec<u8>>> {
        let mut spec = OsString::from(revision);
        spec.push(":");
        spec.push(path.as_os_str());
        self.show_spec(&spec)
    }
    pub fn worktree_content(&self, path: &Path) -> GitResult<Option<Vec<u8>>> {
        let full = self.context.root.join(path);
        match std::fs::File::open(full) {
            Ok(mut file) => {
                use std::io::Read;
                let mut data = Vec::with_capacity(diff::DEFAULT_MAX_BYTES + 1);
                file.by_ref()
                    .take((diff::DEFAULT_MAX_BYTES + 1) as u64)
                    .read_to_end(&mut data)
                    .map_err(|error| GitError {
                        category: GitErrorCategory::Io,
                        message: "Não foi possível ler o arquivo".into(),
                        details: Some(error.to_string()),
                    })?;
                Ok(Some(data))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(GitError {
                category: GitErrorCategory::Io,
                message: "Não foi possível ler o arquivo".into(),
                details: Some(error.to_string()),
            }),
        }
    }
    pub fn is_worktree_path_relevant(&self, path: &Path) -> bool {
        // `check-ignore` treats tracked paths as visible, even if an ignore
        // rule later matches them.  Event-driven checks are only used for
        // worktree watcher paths; no polling occurs.
        let tracked = runner::read_os(
            &self.context.root,
            &[
                std::ffi::OsStr::new("ls-files"),
                std::ffi::OsStr::new("--error-unmatch"),
                std::ffi::OsStr::new("--"),
                path.as_os_str(),
            ],
        )
        .is_ok();
        tracked
            || runner::read_os_no_literal(
                &self.context.root,
                &[
                    std::ffi::OsStr::new("check-ignore"),
                    std::ffi::OsStr::new("-q"),
                    std::ffi::OsStr::new("--"),
                    path.as_os_str(),
                ],
            )
            .is_err()
    }
    pub fn relevant_worktree_paths(&self) -> GitResult<Vec<PathBuf>> {
        let raw = runner::read(
            &self.context.root,
            &[
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
                "-z",
            ],
        )?;
        Ok(raw
            .split(|byte| *byte == 0)
            .filter(|path| !path.is_empty())
            .map(status::path_from_bytes)
            .collect())
    }
    fn show_spec(&self, spec: &OsString) -> GitResult<Option<Vec<u8>>> {
        match runner::read_os(
            &self.context.root,
            &[
                std::ffi::OsStr::new("show"),
                std::ffi::OsStr::new("--no-textconv"),
                std::ffi::OsStr::new("--format="),
                spec.as_os_str(),
            ],
        ) {
            Ok(data) => Ok(Some(data)),
            Err(error)
                if error.category == GitErrorCategory::Process
                    && error.details.as_deref().is_some_and(is_missing_path_error) =>
            {
                Ok(None)
            }
            Err(error) => Err(error),
        }
    }
    pub fn stage(&self, path: &Path) -> GitResult<()> {
        operations::stage(&self.context.root, path)
    }
    pub fn unstage(&self, path: &Path) -> GitResult<()> {
        operations::unstage(&self.context.root, path)
    }
    pub fn stage_file(&self, file: &ChangedFile) -> GitResult<()> {
        operations::stage_file(&self.context.root, file)
    }
    pub fn unstage_file(&self, file: &ChangedFile) -> GitResult<()> {
        operations::unstage_file(&self.context.root, file)
    }
    pub fn commit(&self, message: &str) -> GitResult<String> {
        operations::commit(&self.context.root, message)
    }
    pub fn commit_amend(&self, message: &str) -> GitResult<String> {
        operations::commit_amend(&self.context.root, message)
    }
    pub fn fetch(&self) -> GitResult<()> {
        operations::fetch(&self.context.root)
    }
    pub fn pull(&self) -> GitResult<()> {
        operations::pull(&self.context.root)
    }
    pub fn pull_with_strategy(&self, strategy: Option<&str>) -> GitResult<()> {
        operations::pull_with_strategy(&self.context.root, strategy)
    }
    pub fn push(&self) -> GitResult<()> {
        operations::push(&self.context.root)
    }
    pub fn push_force_with_lease(&self) -> GitResult<()> {
        operations::push_force_with_lease(&self.context.root)
    }
    pub fn checkout_branch(&self, branch: &str) -> GitResult<()> {
        operations::checkout_branch(&self.context.root, branch)
    }
    pub fn create_branch(
        &self,
        name: &str,
        start_point: Option<&str>,
        checkout: bool,
    ) -> GitResult<()> {
        operations::create_branch(&self.context.root, name, start_point, checkout)
    }
    pub fn merge_branch(&self, branch: &str) -> GitResult<String> {
        operations::merge_branch(&self.context.root, branch)
    }
    pub fn merge_branch_with_strategy(&self, branch: &str, strategy: Option<&str>) -> GitResult<String> {
        operations::merge_branch_with_strategy(&self.context.root, branch, strategy)
    }
    pub fn delete_branch(&self, branch: &str, force: bool) -> GitResult<()> {
        operations::delete_branch(&self.context.root, branch, force)
    }
    pub fn stash_push(&self, message: Option<&str>, include_untracked: bool) -> GitResult<String> {
        operations::stash_push(&self.context.root, message, include_untracked)
    }
    pub fn stash_pop(&self, stash_ref: Option<&str>) -> GitResult<String> {
        operations::stash_pop(&self.context.root, stash_ref)
    }
    pub fn stash_apply(&self, stash_ref: Option<&str>) -> GitResult<String> {
        operations::stash_apply(&self.context.root, stash_ref)
    }
    pub fn stash_drop(&self, stash_ref: Option<&str>) -> GitResult<String> {
        operations::stash_drop(&self.context.root, stash_ref)
    }
    pub fn cherry_pick(&self, oid: &str) -> GitResult<String> {
        operations::cherry_pick(&self.context.root, oid)
    }
    pub fn delete_remote_branch(&self, full_ref: &str) -> GitResult<()> {
        operations::delete_remote_branch(&self.context.root, full_ref)
    }
    pub fn reset_head(&self, oid: &str, mode: &str) -> GitResult<String> {
        operations::reset_head(&self.context.root, oid, mode)
    }
    pub fn discard_file(&self, file: &ChangedFile) -> GitResult<()> {
        operations::discard_file(&self.context.root, file)
    }
    pub fn discard_all_unstaged(&self) -> GitResult<()> {
        operations::discard_all_unstaged(&self.context.root)
    }
    pub fn revert_commit(&self, oid: &str) -> GitResult<String> {
        operations::revert_commit(&self.context.root, oid)
    }
    pub fn create_tag(
        &self,
        name: &str,
        oid: Option<&str>,
        message: Option<&str>,
        force: bool,
    ) -> GitResult<String> {
        operations::create_tag(&self.context.root, name, oid, message, force)
    }
    pub fn delete_tag(
        &self,
        name: &str,
        delete_remote: bool,
        remote: Option<&str>,
    ) -> GitResult<()> {
        operations::delete_tag(&self.context.root, name, delete_remote, remote)
    }
    pub fn push_tag(&self, tag: &str, remote: Option<&str>, force: bool) -> GitResult<String> {
        operations::push_tag(&self.context.root, tag, remote, force)
    }
    pub fn rebase(&self, target: &str) -> GitResult<String> {
        operations::rebase(&self.context.root, target)
    }
    pub fn rebase_continue(&self) -> GitResult<String> {
        operations::rebase_continue(&self.context.root)
    }
    pub fn rebase_abort(&self) -> GitResult<String> {
        operations::rebase_abort(&self.context.root)
    }
    pub fn rebase_skip(&self) -> GitResult<String> {
        operations::rebase_skip(&self.context.root)
    }
    pub fn merge_abort(&self) -> GitResult<String> {
        operations::merge_abort(&self.context.root)
    }
    pub fn merge_squash(&self, branch: &str) -> GitResult<String> {
        operations::merge_squash(&self.context.root, branch)
    }
    pub fn cherry_pick_abort(&self) -> GitResult<String> {
        operations::cherry_pick_abort(&self.context.root)
    }
    pub fn cherry_pick_continue(&self) -> GitResult<String> {
        operations::cherry_pick_continue(&self.context.root)
    }
    pub fn file_hunks(&self, file: &ChangedFile) -> GitResult<Vec<DiffHunk>> {
        if file.status == FileStatus::Untracked
            || file.status == FileStatus::Conflicted
            || file.is_binary
        {
            return Ok(Vec::new());
        }
        let mut args: Vec<&std::ffi::OsStr> = if file.area == FileArea::Staged {
            vec![
                std::ffi::OsStr::new("diff"),
                std::ffi::OsStr::new("--cached"),
                std::ffi::OsStr::new("-U3"),
                std::ffi::OsStr::new("--no-color"),
                std::ffi::OsStr::new("--no-ext-diff"),
                std::ffi::OsStr::new("--"),
            ]
        } else {
            vec![
                std::ffi::OsStr::new("diff"),
                std::ffi::OsStr::new("-U3"),
                std::ffi::OsStr::new("--no-color"),
                std::ffi::OsStr::new("--no-ext-diff"),
                std::ffi::OsStr::new("--"),
            ]
        };
        if let Some(old) = &file.old_path {
            args.push(old.as_os_str());
        }
        args.push(file.path.as_os_str());
        let raw = runner::read_os(&self.context.root, &args)?;
        Ok(diff::parse_hunks(&raw))
    }
    pub fn apply_patch(&self, patch: &str, target: operations::PatchTarget) -> GitResult<()> {
        operations::apply_patch(&self.context.root, patch, target)
    }
    pub fn add_to_gitignore(&self, pattern: &str) -> GitResult<()> {
        operations::add_to_gitignore(&self.context.root, pattern)
    }
    pub fn open_terminal(&self, terminal: Option<&str>) -> GitResult<()> {
        operations::open_terminal(&self.context.root, terminal)
    }
    pub fn open_editor(&self, rel_path: Option<&str>) -> GitResult<()> {
        operations::open_editor(&self.context.root, rel_path)
    }
    pub fn reveal_file(&self, rel_path: &str) -> GitResult<()> {
        operations::reveal_file(&self.context.root, rel_path)
    }
    pub fn commit_details(&self, oid: &str) -> GitResult<CommitDetails> {
        operations::commit_details(&self.context.root, oid)
    }
    pub fn file_blame(&self, rel_path: &str, commit_oid: Option<&str>) -> GitResult<Vec<BlameLine>> {
        operations::file_blame(&self.context.root, rel_path, commit_oid)
    }
    pub fn file_history(&self, rel_path: &str, max_count: usize) -> GitResult<Vec<FileHistoryEntry>> {
        operations::file_history(&self.context.root, rel_path, max_count)
    }
    pub fn reflog(&self, max_count: usize) -> GitResult<Vec<ReflogEntry>> {
        operations::reflog(&self.context.root, max_count)
    }
    pub fn get_remotes(&self) -> GitResult<Vec<RemoteEntry>> {
        operations::get_remotes(&self.context.root)
    }
    pub fn add_remote(&self, name: &str, url: &str) -> GitResult<()> {
        operations::add_remote(&self.context.root, name, url)
    }
    pub fn remove_remote(&self, name: &str) -> GitResult<()> {
        operations::remove_remote(&self.context.root, name)
    }
    pub fn set_remote_url(&self, name: &str, url: &str) -> GitResult<()> {
        operations::set_remote_url(&self.context.root, name, url)
    }
    pub fn fetch_prune(&self, remote: Option<&str>) -> GitResult<String> {
        operations::fetch_prune(&self.context.root, remote)
    }
    pub fn resolve_conflict(&self, rel_path: &str, choice: &str) -> GitResult<()> {
        operations::resolve_conflict(&self.context.root, rel_path, choice)
    }
}

fn index_spec(path: &Path) -> OsString {
    let mut spec = OsString::from(":");
    spec.push(path.as_os_str());
    spec
}

fn is_missing_path_error(details: &str) -> bool {
    let details = details.to_ascii_lowercase();
    details.contains("does not exist")
        || details.contains("exists on disk, but not in")
        || details.contains("path '")
        // `HEAD:<path>` has no object to resolve in a repository before its
        // first commit. For a staged file that is the expected empty side.
        || details.contains("invalid object name 'head'")
        || details.contains("unknown revision or path not in the working tree")
        || details.contains("not at stage")
}
impl GitService for GitRepository {
    fn context(&self) -> &RepoContext {
        &self.context
    }
}
pub type GitClient = GitRepository;

fn path_from_git_output(mut bytes: Vec<u8>) -> GitResult<PathBuf> {
    while matches!(bytes.last(), Some(b'\n' | b'\r')) {
        bytes.pop();
    }
    if bytes.is_empty() {
        return Err(GitError {
            category: GitErrorCategory::Parse,
            message: "Raiz do repositório inválida".into(),
            details: None,
        });
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        Ok(PathBuf::from(OsString::from_vec(bytes)))
    }
    #[cfg(not(unix))]
    {
        String::from_utf8(bytes)
            .map(PathBuf::from)
            .map_err(|error| GitError {
                category: GitErrorCategory::Parse,
                message: "Raiz do repositório inválida".into(),
                details: Some(error.to_string()),
            })
    }
}
