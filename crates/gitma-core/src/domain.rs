use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub id: String,
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub patch: String,
}

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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FileArea {
    Staged,
    Unstaged,
    Commit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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
    pub insertions: Option<usize>,
    pub deletions: Option<usize>,
    pub is_binary: bool,
}

impl ChangedFile {
    pub fn new(
        path: PathBuf,
        old_path: Option<PathBuf>,
        status: FileStatus,
        area: FileArea,
    ) -> Self {
        Self {
            path,
            old_path,
            status,
            area,
            insertions: None,
            deletions: None,
            is_binary: false,
        }
    }
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub oid: String,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub author_timestamp: i64,
    pub committer_name: String,
    pub committer_email: String,
    pub committer_timestamp: i64,
    pub subject: String,
    pub body: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line_number: usize,
    pub commit_oid: String,
    pub author: String,
    pub author_mail: String,
    pub author_timestamp: i64,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryEntry {
    pub oid: String,
    pub path: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub oid: String,
    pub selector: String,
    pub action: String,
    pub timestamp: i64,
    pub author: String,
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
    pub ahead: Option<usize>,
    pub behind: Option<usize>,
    pub staged: Vec<ChangedFile>,
    pub unstaged: Vec<ChangedFile>,
    pub conflicted: bool,
    pub in_progress: Option<InProgressOp>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub fetch_url: String,
    pub push_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GitErrorCategory {
    NotRepository,
    Authentication,
    Conflict,
    Diverged,
    RemoteRefNotFound,
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
