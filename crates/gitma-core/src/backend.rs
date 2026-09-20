//! Session-scoped DTO service used by the Tauri command layer.
//!
//! Paths stay as `PathBuf`s until they are rendered for the UI.  The UI only
//! receives opaque file IDs, so display text can never be used as a path.

use crate::domain::{
    ChangedFile, FileArea, FileStatus, GitError, GitResult, GitService, RepoSnapshot,
};
use crate::git::{diff::DEFAULT_MAX_BYTES, GitRepository};
use crate::graph::layout::{layout_page, GraphLayout, LaneState};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, RwLock, Weak};
use std::thread;
use std::time::{Duration, Instant};

pub const HISTORY_PAGE_SIZE: usize = 200;
const DEBOUNCE: Duration = Duration::from_millis(500);
const MAX_DEBOUNCE: Duration = Duration::from_secs(2);
const MAX_LINES: usize = 20_000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub category: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl From<GitError> for AppError {
    fn from(value: GitError) -> Self {
        let category = match value.category {
            crate::domain::GitErrorCategory::NotRepository => "notRepository",
            crate::domain::GitErrorCategory::Authentication => "authentication",
            crate::domain::GitErrorCategory::Conflict => "conflict",
            crate::domain::GitErrorCategory::Diverged => "diverged",
            crate::domain::GitErrorCategory::Process => "process",
            crate::domain::GitErrorCategory::Parse => "parse",
            crate::domain::GitErrorCategory::Io => "io",
        };
        Self {
            category: category.into(),
            message: value.message,
            details: value.details,
        }
    }
}

fn invalid(message: impl Into<String>) -> AppError {
    AppError {
        category: "validation".into(),
        message: message.into(),
        details: None,
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub session_id: String,
    pub root: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<AppError>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: String,
    pub name: String,
    pub directory: String,
    pub path_display: String,
    pub old_path_display: Option<String>,
    pub status: String,
    pub area: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InProgressState {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub session_id: String,
    pub request_id: u64,
    pub revision: u64,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub conflicted: bool,
    pub in_progress: Option<InProgressState>,
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub history_key: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub oid: String,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub author: String,
    pub timestamp: i64,
    pub subject: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub from: usize,
    pub to: usize,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRow {
    pub commit: Commit,
    pub row: usize,
    pub lane: usize,
    pub parent_lanes: Vec<usize>,
    pub connections: Vec<Connection>,
    pub active_lanes: Vec<usize>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub session_id: String,
    pub request_id: u64,
    pub page: usize,
    pub rows: Vec<GraphRow>,
    pub lane_count: usize,
    pub has_more: bool,
    pub history_key: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFiles {
    pub session_id: String,
    pub request_id: u64,
    pub oid: String,
    pub files: Vec<FileEntry>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub session_id: String,
    pub request_id: u64,
    pub file_id: String,
    pub version: String,
    pub kind: String,
    pub original: String,
    pub modified: String,
    pub message: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoChanged {
    pub session_id: String,
    pub scope: String,
    pub paths: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub session_id: String,
    pub request_id: u64,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
    Stage,
    Unstage,
    StageAll,
    UnstageAll,
    Discard,
    DiscardAll,
    Commit,
    CommitAmend,
    Fetch,
    Pull,
    Push,
    ForcePushWithLease,
    SwitchBranch,
    CreateBranch,
    MergeBranch,
    DeleteBranch,
    DeleteRemoteBranch,
    CherryPick,
    CherryPickAbort,
    CherryPickContinue,
    StashPush,
    StashPop,
    StashApply,
    StashDrop,
    Reset,
    RevertCommit,
    CreateTag,
    DeleteTag,
    PushTag,
    Rebase,
    RebaseContinue,
    RebaseAbort,
    RebaseSkip,
    MergeAbort,
    MergeSquash,
}

type Emit = Arc<dyn Fn(RepoChanged) + Send + Sync + 'static>;

pub struct Backend {
    sessions: Mutex<HashMap<String, Arc<SessionState>>>,
    next_session: AtomicU64,
}

struct SessionState {
    id: String,
    repo: GitRepository,
    git_dir: PathBuf,
    emit: Emit,
    files: Mutex<FileRegistry>,
    revision: AtomicU64,
    snapshot: Mutex<SnapshotFingerprint>,
    history: Mutex<HistoryCache>,
    /// Reads can overlap, mutations get exclusive ownership of Git state.
    coordinator: RwLock<()>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Default)]
struct FileRegistry {
    next: u64,
    ids: Vec<(FileKey, String)>,
    entries: HashMap<String, NativeFile>,
}
#[derive(Default)]
struct SnapshotFingerprint {
    value: Option<String>,
    revision: u64,
}
#[derive(Default)]
struct HistoryCache {
    key: String,
    layouts: Vec<GraphLayout>,
    lanes: Vec<LaneState>,
    exhausted: bool,
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct FileKey {
    context: NativeContext,
    area: FileArea,
    path: PathBuf,
    old_path: Option<PathBuf>,
}
#[derive(Clone, Debug, PartialEq, Eq)]
enum NativeContext {
    Local,
    Commit(String),
}
#[derive(Clone)]
struct NativeFile {
    context: NativeContext,
    file: ChangedFile,
}

impl Default for Backend {
    fn default() -> Self {
        Self::new()
    }
}
impl Backend {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_session: AtomicU64::new(1),
        }
    }

    pub fn open(
        &self,
        path: impl AsRef<Path>,
        emit: impl Fn(RepoChanged) + Send + Sync + 'static,
    ) -> Result<Session, AppError> {
        let repo = GitRepository::open(path)?;
        let git_dir = repo.git_dir()?;
        let sequence = self.next_session.fetch_add(1, Ordering::Relaxed);
        let id = format!("repo-{sequence}");
        let root = repo.context().root.clone();
        let name = root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let state = Arc::new(SessionState {
            id: id.clone(),
            repo,
            git_dir,
            emit: Arc::new(emit),
            files: Mutex::new(FileRegistry::default()),
            revision: AtomicU64::new(0),
            snapshot: Mutex::new(SnapshotFingerprint::default()),
            history: Mutex::new(HistoryCache::default()),
            coordinator: RwLock::new(()),
            watcher: Mutex::new(None),
        });
        // Opening a repository remains useful when the operating system cannot
        // provide file watches. The UI can retain this warning while manual
        // refreshes and all Git operations continue to work.
        let warning = install_watcher(&state).err();
        self.sessions
            .lock()
            .expect("sessions lock poisoned")
            .insert(id.clone(), state);
        Ok(Session {
            session_id: id,
            root: root.to_string_lossy().into_owned(),
            name,
            warning,
        })
    }

    pub fn close(&self, session_id: &str) -> Result<(), AppError> {
        self.sessions
            .lock()
            .expect("sessions lock poisoned")
            .remove(session_id)
            .map(|_| ())
            .ok_or_else(|| invalid("Sessão não encontrada"))
    }

    pub fn shutdown(&self) {
        self.sessions
            .lock()
            .expect("sessions lock poisoned")
            .clear();
    }

    pub fn snapshot(&self, session_id: &str, request_id: u64) -> Result<Snapshot, AppError> {
        let state = self.session(session_id)?;
        let _read = state.coordinator.read().expect("coordinator lock poisoned");
        let raw = state.repo.snapshot()?;
        let history_key = state.repo.history_key()?;
        let revision = update_snapshot_revision(&state, &raw, &history_key);
        let staged = register_files(&state, NativeContext::Local, raw.staged);
        let unstaged = register_files(&state, NativeContext::Local, raw.unstaged);
        let in_progress = raw.in_progress.map(|op| InProgressState {
            kind: match op.kind {
                crate::domain::InProgressKind::Merge => "merge".to_string(),
                crate::domain::InProgressKind::Rebase => "rebase".to_string(),
                crate::domain::InProgressKind::CherryPick => "cherryPick".to_string(),
                crate::domain::InProgressKind::Revert => "revert".to_string(),
            },
            message: op.message,
        });
        Ok(Snapshot {
            session_id: state.id.clone(),
            request_id,
            revision,
            branch: raw.branch,
            upstream: raw.upstream,
            conflicted: raw.conflicted,
            in_progress,
            staged,
            unstaged,
            history_key,
        })
    }

    pub fn history(
        &self,
        session_id: &str,
        request_id: u64,
        page: usize,
    ) -> Result<History, AppError> {
        let state = self.session(session_id)?;
        let _read = state.coordinator.read().expect("coordinator lock poisoned");
        let history_key = state.repo.history_key()?;
        let layout = cached_history_page(&state, &history_key, page)?;
        let rows = layout
            .rows
            .into_iter()
            .map(|row| GraphRow {
                commit: Commit {
                    oid: row.commit.oid,
                    parents: row.commit.parents,
                    refs: row.commit.refs,
                    author: row.commit.author,
                    timestamp: row.commit.timestamp,
                    subject: row.commit.subject,
                },
                row: page
                    .saturating_mul(HISTORY_PAGE_SIZE)
                    .saturating_add(row.row),
                lane: row.lane,
                parent_lanes: row.parent_lanes,
                connections: row
                    .connections
                    .into_iter()
                    .map(|c| Connection {
                        from: c.from,
                        to: c.to,
                    })
                    .collect(),
                active_lanes: row.active_lanes,
            })
            .collect();
        Ok(History {
            session_id: state.id.clone(),
            request_id,
            page,
            rows,
            lane_count: layout.lane_count,
            has_more: layout.has_more,
            history_key,
        })
    }

    pub fn commit_files(
        &self,
        session_id: &str,
        request_id: u64,
        oid: &str,
    ) -> Result<CommitFiles, AppError> {
        validate_oid(oid)?;
        let state = self.session(session_id)?;
        let _read = state.coordinator.read().expect("coordinator lock poisoned");
        let files = register_files(
            &state,
            NativeContext::Commit(oid.into()),
            state.repo.files_for_commit(oid)?,
        );
        Ok(CommitFiles {
            session_id: state.id.clone(),
            request_id,
            oid: oid.into(),
            files,
        })
    }

    pub fn file_preview(
        &self,
        session_id: &str,
        request_id: u64,
        file_id: &str,
    ) -> Result<Preview, AppError> {
        let state = self.session(session_id)?;
        let _read = state.coordinator.read().expect("coordinator lock poisoned");
        let selected = state
            .files
            .lock()
            .expect("file registry lock poisoned")
            .entries
            .get(file_id)
            .cloned()
            .ok_or_else(|| invalid("Arquivo não pertence a esta sessão"))?;
        let (original_bytes, modified_bytes) = preview_bytes(&state.repo, &selected)?;
        let version = preview_version(
            file_id,
            original_bytes.as_deref(),
            modified_bytes.as_deref(),
        );
        let (kind, original, modified, message) =
            classify_preview(original_bytes, modified_bytes, selected.file.status);
        Ok(Preview {
            session_id: state.id.clone(),
            request_id,
            file_id: file_id.into(),
            version,
            kind: kind.into(),
            original,
            modified,
            message,
        })
    }

    pub fn apply_operation(
        &self,
        session_id: &str,
        request_id: u64,
        operation: Operation,
        file_ids: &[String],
        message: &str,
    ) -> Result<OperationResult, AppError> {
        let state = self.session(session_id)?;
        let _write = state
            .coordinator
            .write()
            .expect("coordinator lock poisoned");
        let files = resolve_files(&state, file_ids)?;
        match operation {
            Operation::Stage => {
                require_area(
                    &files,
                    FileArea::Unstaged,
                    "Somente arquivos não preparados podem ser adicionados",
                )?;
                for file in &files {
                    state.repo.stage_file(&file.file)?;
                }
            }
            Operation::Unstage => {
                require_area(
                    &files,
                    FileArea::Staged,
                    "Somente arquivos preparados podem ser removidos",
                )?;
                for file in &files {
                    state.repo.unstage_file(&file.file)?;
                }
            }
            Operation::StageAll => {
                reject_files(file_ids)?;
                state.repo.stage(Path::new("."))?;
            }
            Operation::UnstageAll => {
                reject_files(file_ids)?;
                for file in state.repo.snapshot()?.staged {
                    state.repo.unstage_file(&file)?;
                }
            }
            Operation::Discard => {
                require_area(
                    &files,
                    FileArea::Unstaged,
                    "Somente alterações não preparadas podem ser descartadas",
                )?;
                for file in &files {
                    state.repo.discard_file(&file.file)?;
                }
            }
            Operation::DiscardAll => {
                reject_files(file_ids)?;
                state.repo.discard_all_unstaged()?;
            }
            Operation::Commit => {
                reject_files(file_ids)?;
                let message = message.trim();
                if message.is_empty() {
                    return Err(invalid("A mensagem do commit é obrigatória"));
                }
                state.repo.commit(message)?;
            }
            Operation::CommitAmend => {
                reject_files(file_ids)?;
                state.repo.commit_amend(message)?;
            }
            Operation::Fetch => {
                reject_files(file_ids)?;
                state.repo.fetch()?;
            }
            Operation::Pull => {
                reject_files(file_ids)?;
                state.repo.pull()?;
            }
            Operation::Push => {
                reject_files(file_ids)?;
                state.repo.push()?;
            }
            Operation::ForcePushWithLease => {
                reject_files(file_ids)?;
                state.repo.push_force_with_lease()?;
            }
            Operation::SwitchBranch => {
                reject_files(file_ids)?;
                let branch = message.trim();
                if branch.is_empty() {
                    return Err(invalid("O nome da branch é obrigatório"));
                }
                state.repo.checkout_branch(branch)?;
            }
            Operation::CreateBranch => {
                reject_files(file_ids)?;
                #[derive(Deserialize)]
                struct CreateBranchParams {
                    name: String,
                    #[serde(rename = "startPoint")]
                    start_point: Option<String>,
                    #[serde(default = "default_true")]
                    checkout: bool,
                }
                fn default_true() -> bool {
                    true
                }
                let (name, start_point, checkout) =
                    if let Ok(params) = serde_json::from_str::<CreateBranchParams>(message) {
                        (params.name, params.start_point, params.checkout)
                    } else {
                        (message.trim().to_string(), None, true)
                    };
                if name.trim().is_empty() {
                    return Err(invalid("O nome da branch é obrigatório"));
                }
                state
                    .repo
                    .create_branch(name.trim(), start_point.as_deref(), checkout)?;
            }
            Operation::MergeBranch => {
                reject_files(file_ids)?;
                let branch = message.trim();
                if branch.is_empty() {
                    return Err(invalid("O nome da branch para merge é obrigatório"));
                }
                state.repo.merge_branch(branch)?;
            }
            Operation::DeleteBranch => {
                reject_files(file_ids)?;
                #[derive(Deserialize)]
                struct DeleteBranchParams {
                    branch: String,
                    #[serde(default = "default_true")]
                    force: bool,
                }
                fn default_true() -> bool {
                    true
                }
                let (branch, force) =
                    if let Ok(params) = serde_json::from_str::<DeleteBranchParams>(message) {
                        (params.branch, params.force)
                    } else {
                        (message.trim().to_string(), true)
                    };
                if branch.trim().is_empty() {
                    return Err(invalid("O nome da branch para exclusão é obrigatório"));
                }
                state.repo.delete_branch(branch.trim(), force)?;
            }
            Operation::DeleteRemoteBranch => {
                reject_files(file_ids)?;
                let branch = message.trim();
                if branch.is_empty() {
                    return Err(invalid(
                        "O nome da branch remota para exclusão é obrigatório",
                    ));
                }
                state.repo.delete_remote_branch(branch)?;
            }
            Operation::CherryPick => {
                reject_files(file_ids)?;
                let oid = message.trim();
                if oid.is_empty() {
                    return Err(invalid(
                        "O identificador do commit para cherry-pick é obrigatório",
                    ));
                }
                state.repo.cherry_pick(oid)?;
            }
            Operation::StashPush => {
                reject_files(file_ids)?;
                #[derive(Deserialize)]
                struct StashPushParams {
                    message: Option<String>,
                    #[serde(default)]
                    include_untracked: bool,
                }
                let (msg, untracked) =
                    if let Ok(params) = serde_json::from_str::<StashPushParams>(message) {
                        (params.message, params.include_untracked)
                    } else if !message.trim().is_empty() {
                        (Some(message.trim().to_string()), false)
                    } else {
                        (None, false)
                    };
                state.repo.stash_push(msg.as_deref(), untracked)?;
            }
            Operation::StashPop => {
                reject_files(file_ids)?;
                let stash_ref = (!message.trim().is_empty()).then(|| message.trim());
                state.repo.stash_pop(stash_ref)?;
            }
            Operation::StashApply => {
                reject_files(file_ids)?;
                let stash_ref = (!message.trim().is_empty()).then(|| message.trim());
                state.repo.stash_apply(stash_ref)?;
            }
            Operation::StashDrop => {
                reject_files(file_ids)?;
                let stash_ref = (!message.trim().is_empty()).then(|| message.trim());
                state.repo.stash_drop(stash_ref)?;
            }
            Operation::Reset => {
                reject_files(file_ids)?;
                #[derive(Deserialize)]
                struct ResetParams {
                    #[serde(rename = "commitOid")]
                    commit_oid: Option<String>,
                    oid: Option<String>,
                    #[serde(default)]
                    mode: String,
                }
                let (oid, mode) = if let Ok(params) = serde_json::from_str::<ResetParams>(message) {
                    (
                        params.commit_oid.or(params.oid).unwrap_or_default(),
                        params.mode,
                    )
                } else {
                    (message.trim().to_string(), "mixed".to_string())
                };
                if oid.trim().is_empty() {
                    return Err(invalid(
                        "O identificador do commit para reset é obrigatório",
                    ));
                }
                state.repo.reset_head(oid.trim(), &mode)?;
            }
            Operation::RevertCommit => {
                reject_files(file_ids)?;
                let oid = message.trim();
                if oid.is_empty() {
                    return Err(invalid(
                        "O identificador do commit para reverter é obrigatório",
                    ));
                }
                state.repo.revert_commit(oid)?;
            }
            Operation::CreateTag => {
                reject_files(file_ids)?;
                #[derive(Deserialize)]
                struct CreateTagParams {
                    name: String,
                    oid: Option<String>,
                    message: Option<String>,
                    #[serde(default)]
                    push: bool,
                }
                let (name, oid, msg, push) =
                    if let Ok(params) = serde_json::from_str::<CreateTagParams>(message) {
                        (params.name, params.oid, params.message, params.push)
                    } else {
                        (message.trim().to_string(), None, None, false)
                    };
                if name.trim().is_empty() {
                    return Err(invalid("O nome da tag é obrigatório"));
                }
                state
                    .repo
                    .create_tag(name.trim(), oid.as_deref(), msg.as_deref())?;
                if push {
                    state.repo.push_tag(name.trim(), None)?;
                }
            }
            Operation::DeleteTag => {
                reject_files(file_ids)?;
                let (name, delete_remote, remote) =
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(message) {
                        if let Some(obj) = val.as_object() {
                            let name = obj
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let delete_remote = obj
                                .get("deleteRemote")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            let remote = obj
                                .get("remote")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            (name, delete_remote, remote)
                        } else if let Some(s) = val.as_str() {
                            (s.to_string(), false, None)
                        } else {
                            (message.trim().to_string(), false, None)
                        }
                    } else {
                        (message.trim().to_string(), false, None)
                    };
                if name.trim().is_empty() {
                    return Err(invalid("O nome da tag é obrigatório"));
                }
                state
                    .repo
                    .delete_tag(name.trim(), delete_remote, remote.as_deref())?;
            }
            Operation::PushTag => {
                reject_files(file_ids)?;
                let (name, remote) =
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(message) {
                        if let Some(obj) = val.as_object() {
                            let name = obj
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let remote = obj
                                .get("remote")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            (name, remote)
                        } else if let Some(s) = val.as_str() {
                            (s.to_string(), None)
                        } else {
                            (message.trim().to_string(), None)
                        }
                    } else {
                        (message.trim().to_string(), None)
                    };
                if name.trim().is_empty() {
                    return Err(invalid("O nome da tag é obrigatório"));
                }
                state
                    .repo
                    .push_tag(name.trim(), remote.as_deref())?;
            }
            Operation::Rebase => {
                reject_files(file_ids)?;
                let target = message.trim();
                if target.is_empty() {
                    return Err(invalid("O alvo para rebase é obrigatório"));
                }
                state.repo.rebase(target)?;
            }
            Operation::RebaseContinue => {
                reject_files(file_ids)?;
                state.repo.rebase_continue()?;
            }
            Operation::RebaseAbort => {
                reject_files(file_ids)?;
                state.repo.rebase_abort()?;
            }
            Operation::RebaseSkip => {
                reject_files(file_ids)?;
                state.repo.rebase_skip()?;
            }
            Operation::MergeAbort => {
                reject_files(file_ids)?;
                state.repo.merge_abort()?;
            }
            Operation::MergeSquash => {
                reject_files(file_ids)?;
                let branch = message.trim();
                if branch.is_empty() {
                    return Err(invalid(
                        "O nome da branch para merge com squash é obrigatório",
                    ));
                }
                state.repo.merge_squash(branch)?;
            }
            Operation::CherryPickAbort => {
                reject_files(file_ids)?;
                state.repo.cherry_pick_abort()?;
            }
            Operation::CherryPickContinue => {
                reject_files(file_ids)?;
                state.repo.cherry_pick_continue()?;
            }
        }
        (state.emit)(RepoChanged {
            session_id: state.id.clone(),
            scope: "all".into(),
            paths: Vec::new(),
        });
        let result_message = match operation {
            Operation::Stage => "Alterações preparadas",
            Operation::Unstage => "Alterações removidas do preparo",
            Operation::StageAll => "Todas as alterações foram preparadas",
            Operation::UnstageAll => "Todas as alterações foram removidas do preparo",
            Operation::Discard => "Alterações descartadas",
            Operation::DiscardAll => "Todas as alterações não preparadas foram descartadas",
            Operation::Commit => "Commit realizado com sucesso",
            Operation::CommitAmend => "Commit emendado com sucesso",
            Operation::Fetch => "Fetch concluído",
            Operation::Pull => "Pull concluído",
            Operation::Push | Operation::ForcePushWithLease => "Push concluído",
            Operation::SwitchBranch => "Branch alterada",
            Operation::CreateBranch => "Branch criada",
            Operation::MergeBranch => "Merge concluído",
            Operation::MergeSquash => "Merge com squash preparado no stage",
            Operation::DeleteBranch | Operation::DeleteRemoteBranch => "Branch excluída",
            Operation::CherryPick => "Cherry-pick aplicado",
            Operation::CherryPickAbort => "Cherry-pick abortado",
            Operation::CherryPickContinue => "Cherry-pick continuado",
            Operation::StashPush => "Stash criado com sucesso",
            Operation::StashPop => "Stash aplicado e removido",
            Operation::StashApply => "Stash aplicado",
            Operation::StashDrop => "Stash descartado",
            Operation::Reset => "Reset concluído com sucesso",
            Operation::RevertCommit => "Commit revertido com sucesso",
            Operation::CreateTag => "Tag criada com sucesso",
            Operation::DeleteTag => "Tag excluída com sucesso",
            Operation::PushTag => "Tag enviada ao repositório remoto com sucesso",
            Operation::Rebase => "Rebase concluído com sucesso",
            Operation::RebaseContinue => "Rebase continuado com sucesso",
            Operation::RebaseAbort => "Rebase abortado com sucesso",
            Operation::RebaseSkip => "Commit pulado no rebase",
            Operation::MergeAbort => "Merge abortado com sucesso",
        };
        Ok(OperationResult {
            session_id: state.id.clone(),
            request_id,
            message: result_message.into(),
        })
    }

    fn session(&self, id: &str) -> Result<Arc<SessionState>, AppError> {
        self.sessions
            .lock()
            .expect("sessions lock poisoned")
            .get(id)
            .cloned()
            .ok_or_else(|| invalid("Sessão não encontrada"))
    }
}

fn validate_oid(oid: &str) -> Result<(), AppError> {
    if oid.len() < 4 || oid.len() > 64 || !oid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid("Identificador de commit inválido"));
    }
    Ok(())
}
fn reject_files(ids: &[String]) -> Result<(), AppError> {
    if ids.is_empty() {
        Ok(())
    } else {
        Err(invalid("Esta operação não aceita arquivos selecionados"))
    }
}
fn require_area(files: &[NativeFile], area: FileArea, message: &str) -> Result<(), AppError> {
    if files.is_empty() || files.iter().any(|file| file.file.area != area) {
        Err(invalid(message))
    } else {
        Ok(())
    }
}
fn resolve_files(state: &SessionState, ids: &[String]) -> Result<Vec<NativeFile>, AppError> {
    let registry = state.files.lock().expect("file registry lock poisoned");
    ids.iter()
        .map(|id| {
            registry
                .entries
                .get(id)
                .cloned()
                .ok_or_else(|| invalid("Arquivo não pertence a esta sessão"))
        })
        .collect()
}

fn register_files(
    state: &SessionState,
    context: NativeContext,
    files: Vec<ChangedFile>,
) -> Vec<FileEntry> {
    let mut registry = state.files.lock().expect("file registry lock poisoned");
    files
        .into_iter()
        .map(|file| {
            let key = FileKey {
                context: context.clone(),
                area: file.area.clone(),
                path: file.path.clone(),
                old_path: file.old_path.clone(),
            };
            let id = if let Some((_, id)) = registry.ids.iter().find(|(stored, _)| *stored == key) {
                id.clone()
            } else {
                registry.next += 1;
                let id = format!("file-{}", registry.next);
                registry.ids.push((key, id.clone()));
                id
            };
            registry.entries.insert(
                id.clone(),
                NativeFile {
                    context: context.clone(),
                    file: file.clone(),
                },
            );
            dto_file(id, file)
        })
        .collect()
}
fn dto_file(id: String, file: ChangedFile) -> FileEntry {
    let display = file.path.to_string_lossy().into_owned();
    let name = file
        .path
        .file_name()
        .unwrap_or(file.path.as_os_str())
        .to_string_lossy()
        .into_owned();
    let directory = file
        .path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    FileEntry {
        id,
        name,
        directory,
        path_display: display,
        old_path_display: file
            .old_path
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned()),
        status: status_name(file.status).into(),
        area: area_name(file.area).into(),
    }
}
fn status_name(status: FileStatus) -> &'static str {
    match status {
        FileStatus::Added => "added",
        FileStatus::Modified => "modified",
        FileStatus::Deleted => "deleted",
        FileStatus::Renamed => "renamed",
        FileStatus::Copied => "copied",
        FileStatus::Untracked => "untracked",
        FileStatus::Conflicted => "conflicted",
    }
}
fn area_name(area: FileArea) -> &'static str {
    match area {
        FileArea::Staged => "staged",
        FileArea::Unstaged => "unstaged",
        FileArea::Commit => "commit",
    }
}

type PreviewBytes = (Option<Vec<u8>>, Option<Vec<u8>>);

fn preview_bytes(repo: &GitRepository, selected: &NativeFile) -> GitResult<PreviewBytes> {
    let old = selected
        .file
        .old_path
        .as_deref()
        .unwrap_or(&selected.file.path);
    match &selected.context {
        NativeContext::Local if selected.file.area == FileArea::Unstaged => Ok((
            repo.index_content(old)?,
            repo.worktree_content(&selected.file.path)?,
        )),
        NativeContext::Local => Ok((
            repo.revision_content("HEAD", old)?,
            repo.index_content(&selected.file.path)?,
        )),
        NativeContext::Commit(oid) => {
            let parent = repo.first_parent(oid)?;
            Ok((
                match parent {
                    Some(parent) => repo.revision_content(&parent, old)?,
                    None => None,
                },
                repo.revision_content(oid, &selected.file.path)?,
            ))
        }
    }
}
fn classify_preview(
    original: Option<Vec<u8>>,
    modified: Option<Vec<u8>>,
    status: FileStatus,
) -> (&'static str, String, String, Option<String>) {
    if status == FileStatus::Conflicted {
        return (
            "conflict",
            String::new(),
            String::new(),
            Some("O arquivo possui conflitos que precisam ser resolvidos.".into()),
        );
    }
    if original.is_none() && modified.is_none() {
        return (
            "missing",
            String::new(),
            String::new(),
            Some("O conteúdo não está mais disponível.".into()),
        );
    }
    let original = original.unwrap_or_default();
    let modified = modified.unwrap_or_default();
    if original.contains(&0) || modified.contains(&0) {
        return (
            "binary",
            String::new(),
            String::new(),
            Some("Arquivos binários não podem ser exibidos.".into()),
        );
    }
    if exceeds_preview_limit(&original) || exceeds_preview_limit(&modified) {
        return (
            "tooLarge",
            String::new(),
            String::new(),
            Some("O arquivo excede o limite de 2 MiB ou 20 mil linhas.".into()),
        );
    }
    (
        "text",
        String::from_utf8_lossy(&original).into_owned(),
        String::from_utf8_lossy(&modified).into_owned(),
        None,
    )
}
fn exceeds_preview_limit(bytes: &[u8]) -> bool {
    if bytes.len() > DEFAULT_MAX_BYTES {
        return true;
    }
    let lines = bytes.iter().filter(|byte| **byte == b'\n').count()
        + usize::from(!bytes.is_empty() && !bytes.ends_with(b"\n"));
    lines > MAX_LINES
}
fn preview_version(file_id: &str, original: Option<&[u8]>, modified: Option<&[u8]>) -> String {
    let mut hash = Sha256::new();
    hash.update(file_id.as_bytes());
    for side in [original, modified] {
        match side {
            Some(bytes) => {
                hash.update((bytes.len() as u64).to_le_bytes());
                hash.update(bytes);
            }
            None => hash.update(u64::MAX.to_le_bytes()),
        }
    }
    format!("{:x}", hash.finalize())
}
fn update_snapshot_revision(
    state: &SessionState,
    snapshot: &RepoSnapshot,
    history_key: &str,
) -> u64 {
    let fingerprint = snapshot_fingerprint(snapshot, history_key);
    let mut stored = state
        .snapshot
        .lock()
        .expect("snapshot fingerprint lock poisoned");
    if stored.value.as_deref() != Some(&fingerprint) {
        stored.value = Some(fingerprint);
        stored.revision = stored.revision.saturating_add(1).max(1);
        state.revision.store(stored.revision, Ordering::Relaxed);
    }
    stored.revision
}
fn cached_history_page(
    state: &SessionState,
    history_key: &str,
    page: usize,
) -> Result<GraphLayout, AppError> {
    let mut cache = state.history.lock().expect("history cache lock poisoned");
    if cache.key != history_key {
        *cache = HistoryCache {
            key: history_key.into(),
            lanes: vec![LaneState::default()],
            ..HistoryCache::default()
        };
    }
    while cache.layouts.len() <= page && !cache.exhausted {
        let current = cache.layouts.len();
        let source = state.repo.history(current, HISTORY_PAGE_SIZE)?;
        let incoming = cache.lanes.last().cloned().unwrap_or_default();
        let (layout, next_lanes) = layout_page(&source, &incoming);
        cache.exhausted = !layout.has_more;
        cache.layouts.push(layout);
        cache.lanes.push(next_lanes);
    }
    Ok(cache.layouts.get(page).cloned().unwrap_or_default())
}
fn snapshot_fingerprint(snapshot: &RepoSnapshot, history_key: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(history_key.as_bytes());
    hash.update([0]);
    hash.update(snapshot.branch.as_deref().unwrap_or("").as_bytes());
    hash.update([0]);
    hash.update(snapshot.upstream.as_deref().unwrap_or("").as_bytes());
    hash.update([snapshot.conflicted as u8]);
    for file in snapshot.staged.iter().chain(&snapshot.unstaged) {
        hash.update(area_name(file.area.clone()).as_bytes());
        hash.update([0]);
        hash.update(status_name(file.status.clone()).as_bytes());
        hash.update([0]);
        hash_native_path(&mut hash, &file.path);
        hash_native_path(
            &mut hash,
            file.old_path.as_deref().unwrap_or_else(|| Path::new("")),
        );
    }
    format!("{:x}", hash.finalize())
}
fn hash_native_path(hash: &mut Sha256, path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let bytes = path.as_os_str().as_bytes();
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    }
    #[cfg(not(unix))]
    {
        let bytes = path.to_string_lossy();
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes.as_bytes());
    }
}

fn install_watcher(state: &Arc<SessionState>) -> Result<(), AppError> {
    let (tx, rx) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |result| {
        let _ = tx.send(result);
    })
    .map_err(|error| AppError {
        category: "watcher".into(),
        message: "Não foi possível observar o repositório".into(),
        details: Some(error.to_string()),
    })?;
    watcher
        .watch(&state.repo.context().root, RecursiveMode::Recursive)
        .map_err(|error| AppError {
            category: "watcher".into(),
            message: "Não foi possível observar o repositório".into(),
            details: Some(error.to_string()),
        })?;
    if state.git_dir != state.repo.context().root.join(".git") {
        watcher
            .watch(&state.git_dir, RecursiveMode::Recursive)
            .map_err(|error| AppError {
                category: "watcher".into(),
                message: "Não foi possível observar os metadados Git".into(),
                details: Some(error.to_string()),
            })?;
    }
    *state.watcher.lock().expect("watcher lock poisoned") = Some(watcher);
    let weak = Arc::downgrade(state);
    thread::spawn(move || watch_loop(weak, rx));
    Ok(())
}

fn watch_loop(state: Weak<SessionState>, rx: mpsc::Receiver<notify::Result<Event>>) {
    let mut pending = Vec::new();
    let mut first = None;
    // Some native backends report the directory contents as creations while a
    // recursive watch is being installed. They describe pre-existing state,
    // not a repository change, and would otherwise force an immediate refresh.
    loop {
        let timeout = first
            .map(|started: Instant| {
                let quiet = Instant::now() + DEBOUNCE;
                let cap = started + MAX_DEBOUNCE;
                quiet.min(cap).saturating_duration_since(Instant::now())
            })
            .unwrap_or(Duration::from_secs(60));
        match rx.recv_timeout(timeout) {
            Ok(Ok(event)) => {
                // Opening files while checking an ignore rule is an access
                // notification on several platforms. It is not a mutation and
                // must never become a recursive watcher self-event.
                if !is_change_event(&event) {
                    continue;
                }
                if first.is_none() {
                    first = Some(Instant::now());
                }
                pending.extend(event.paths);
            }
            Ok(Err(_)) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) if !pending.is_empty() => {
                let Some(session) = state.upgrade() else {
                    break;
                };
                emit_paths(&session, std::mem::take(&mut pending));
                first = None;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }
}
fn is_change_event(event: &Event) -> bool {
    matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) | EventKind::Any
    )
}
fn emit_paths(state: &SessionState, paths: Vec<PathBuf>) {
    let mut scope = None::<&str>;
    let mut display = Vec::new();
    let unique: HashSet<_> = paths.into_iter().collect();
    let mut worktree = Vec::new();
    for path in unique {
        if let Some(found) = metadata_path_scope(state, &path) {
            scope = Some(combine_scope(scope, found));
        } else if let Ok(relative) = path.strip_prefix(&state.repo.context().root) {
            if !relative.as_os_str().is_empty() {
                worktree.push(relative.to_path_buf());
            }
        }
    }
    // A single event-driven file listing decides every worktree path in the
    // burst. This avoids two Git processes per file when a build creates a
    // large ignored directory, while tracked changes always remain visible.
    if !worktree.is_empty() {
        let mut visible: HashSet<_> = state
            .repo
            .relevant_worktree_paths()
            .unwrap_or_default()
            .into_iter()
            .collect();
        visible.extend(
            state
                .files
                .lock()
                .expect("file registry lock poisoned")
                .entries
                .values()
                .filter(|entry| entry.context == NativeContext::Local)
                .flat_map(|entry| {
                    entry
                        .file
                        .old_path
                        .iter()
                        .cloned()
                        .chain(std::iter::once(entry.file.path.clone()))
                }),
        );
        for relative in worktree {
            if visible.contains(&relative) {
                scope = Some(combine_scope(scope, "worktree"));
                let text = relative.to_string_lossy().into_owned();
                if !display.contains(&text) {
                    display.push(text);
                }
            }
        }
    }
    if let Some(scope) = scope {
        (state.emit)(RepoChanged {
            session_id: state.id.clone(),
            scope: scope.into(),
            paths: display,
        });
    }
}
fn combine_scope(current: Option<&'static str>, next: &'static str) -> &'static str {
    match (current, next) {
        (Some("all"), _) | (_, "all") => "all",
        (Some("history"), "worktree") | (Some("worktree"), "history") => "all",
        (Some(current), _) => current,
        (None, next) => next,
    }
}
#[cfg(test)]
fn watch_path_scope(state: &SessionState, path: &Path) -> Option<&'static str> {
    if path
        .components()
        .any(|component| component.as_os_str().to_string_lossy().ends_with(".lock"))
    {
        return None;
    }
    if path.starts_with(&state.git_dir) {
        return metadata_path_scope(state, path);
    }
    let relative = path.strip_prefix(&state.repo.context().root).ok()?;
    (!relative.as_os_str().is_empty() && state.repo.is_worktree_path_relevant(relative))
        .then_some("worktree")
}
fn metadata_path_scope(state: &SessionState, path: &Path) -> Option<&'static str> {
    if path
        .components()
        .any(|component| component.as_os_str().to_string_lossy().ends_with(".lock"))
    {
        return None;
    }
    if !path.starts_with(&state.git_dir) {
        return None;
    }
    let relative = path.strip_prefix(&state.git_dir).ok()?;
    if relative.starts_with("objects") || relative.starts_with("logs") {
        return None;
    }
    if relative == Path::new("index") || relative == Path::new("info/exclude") {
        return Some("all");
    }
    if relative == Path::new("HEAD")
        || relative == Path::new("packed-refs")
        || relative == Path::new("config")
        || relative.starts_with("refs")
    {
        return Some("history");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ignores_locks_objects_and_reflogs() {
        let root = PathBuf::from("/repo");
        let state = SessionState {
            id: "s".into(),
            repo: GitRepository::from_context(crate::domain::RepoContext {
                root: root.clone(),
                generation: 0,
            }),
            git_dir: root.join(".git"),
            emit: Arc::new(|_| {}),
            files: Mutex::new(FileRegistry::default()),
            revision: AtomicU64::new(0),
            snapshot: Mutex::new(SnapshotFingerprint::default()),
            history: Mutex::new(HistoryCache::default()),
            coordinator: RwLock::new(()),
            watcher: Mutex::new(None),
        };
        assert_eq!(
            watch_path_scope(&state, Path::new("/repo/.git/index.lock")),
            None
        );
        assert_eq!(
            watch_path_scope(&state, Path::new("/repo/.git/objects/aa/blob")),
            None
        );
        assert_eq!(
            watch_path_scope(&state, Path::new("/repo/.git/logs/HEAD")),
            None
        );
        assert_eq!(
            watch_path_scope(&state, Path::new("/repo/.git/index")),
            Some("all")
        );
    }
    #[test]
    fn preview_limit_counts_each_side() {
        assert!(exceeds_preview_limit(&vec![b'x'; DEFAULT_MAX_BYTES + 1]));
        assert!(exceeds_preview_limit(
            "x\n".repeat(MAX_LINES + 1).as_bytes()
        ));
        assert!(!exceeds_preview_limit(b"small\n"));
    }
}
