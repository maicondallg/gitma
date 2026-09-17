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
        let (staged, unstaged, conflicted) = status::parse_porcelain_z(&raw);
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
            Err(_) => String::new(), // ausência de upstream é um estado normal
        };
        let in_progress = self
            .git_dir()
            .ok()
            .as_deref()
            .and_then(operations::detect_in_progress);
        Ok(RepoSnapshot {
            branch: (!branch.is_empty()).then_some(branch),
            upstream: (!upstream.is_empty()).then_some(upstream),
            staged,
            unstaged,
            conflicted,
            in_progress,
        })
    }
    pub fn history(&self, page_no: usize, page_size: usize) -> GitResult<HistoryPage> {
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

        let mut args = vec!["log", "--all"];
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
        if head_exists {
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
        Ok(status::parse_commit_names(&raw))
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
    ) -> GitResult<String> {
        operations::create_tag(&self.context.root, name, oid, message)
    }
    pub fn delete_tag(
        &self,
        name: &str,
        delete_remote: bool,
        remote: Option<&str>,
    ) -> GitResult<()> {
        operations::delete_tag(&self.context.root, name, delete_remote, remote)
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
