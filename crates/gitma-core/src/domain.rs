use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoContext {
    pub root: PathBuf,
    pub generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SelectionContext {
    LocalChanges,
    Commit { oid: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FileArea {
    Staged,
    Unstaged,
    Commit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    Conflicted,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChangedFile {
    pub path: PathBuf,
    pub old_path: Option<PathBuf>,
    pub status: FileStatus,
    pub area: FileArea,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileSelection {
    pub context: SelectionContext,
    pub path: PathBuf,
    pub old_path: Option<PathBuf>,
    pub area: FileArea,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitSummary {
    pub oid: String,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub author: String,
    pub timestamp: i64,
    pub subject: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryPage {
    pub commits: Vec<CommitSummary>,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DiffLineKind {
    Context,
    Addition,
    Removal,
    Header,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FileDiff {
    Text {
        lines: Vec<DiffLine>,
        truncated: bool,
    },
    Binary,
    Missing,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InProgressKind {
    Merge,
    Rebase,
    CherryPick,
    Revert,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InProgressOp {
    pub kind: InProgressKind,
    pub message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoSnapshot {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub staged: Vec<ChangedFile>,
    pub unstaged: Vec<ChangedFile>,
    pub conflicted: bool,
    pub in_progress: Option<InProgressOp>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GitErrorCategory {
    NotRepository,
    Authentication,
    Conflict,
    Diverged,
    Process,
    Parse,
    Io,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitError {
    pub category: GitErrorCategory,
    pub message: String,
    pub details: Option<String>,
}

pub type GitResult<T> = Result<T, GitError>;

pub trait GitService: Send + Sync {
    fn context(&self) -> &RepoContext;
}
