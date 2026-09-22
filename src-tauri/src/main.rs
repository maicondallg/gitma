#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

use backend::*;
use std::sync::Arc;
use tauri::{Emitter, State};

type BackendState = Arc<Backend>;
type RpcResult<T> = Result<T, serde_json::Value>;

async fn run<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> RpcResult<T> {
    tauri::async_runtime::spawn_blocking(job).await
        .map_err(|error| serde_json::json!({"category":"process", "message":"Falha ao executar tarefa", "details": error.to_string()}))?
        .map_err(|error| serde_json::to_value(error).unwrap_or_else(|_| serde_json::json!({"category":"process", "message":"Falha no Git"})))
}

#[tauri::command]
async fn open_repository(
    state: State<'_, BackendState>,
    app: tauri::AppHandle,
    path: String,
) -> RpcResult<Session> {
    let state = state.inner().clone();
    run(move || {
        state.open(path, move |event| {
            let _ = app.emit("repo-changed", event);
        })
    })
    .await
}

#[tauri::command]
async fn close_repository(state: State<'_, BackendState>, session_id: String) -> RpcResult<()> {
    let state = state.inner().clone();
    run(move || state.close(&session_id)).await
}

#[tauri::command]
async fn get_snapshot(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
) -> RpcResult<Snapshot> {
    let state = state.inner().clone();
    run(move || state.snapshot(&session_id, request_id)).await
}

#[tauri::command]
async fn get_history(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
    page: usize,
    all_branches: Option<bool>,
) -> RpcResult<History> {
    let state = state.inner().clone();
    run(move || state.history(&session_id, request_id, page, all_branches)).await
}

#[tauri::command]
async fn get_commit_files(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
    oid: String,
) -> RpcResult<CommitFiles> {
    let state = state.inner().clone();
    run(move || state.commit_files(&session_id, request_id, &oid)).await
}

#[tauri::command]
async fn get_file_preview(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
    file_id: String,
) -> RpcResult<Preview> {
    let state = state.inner().clone();
    run(move || state.file_preview(&session_id, request_id, &file_id)).await
}

#[tauri::command]
async fn apply_operation(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
    operation: Operation,
    file_ids: Vec<String>,
    message: String,
) -> RpcResult<OperationResult> {
    let state = state.inner().clone();
    run(move || state.apply_operation(&session_id, request_id, operation, &file_ids, &message))
        .await
}

#[tauri::command]
async fn clone_repository(
    state: State<'_, BackendState>,
    app: tauri::AppHandle,
    source: String,
    destination: String,
) -> RpcResult<Session> {
    let state = state.inner().clone();
    run(move || {
        let dest_path = std::path::PathBuf::from(&destination);
        gitma_core::git::operations::clone_repository(&source, &dest_path)?;
        state.open(destination, move |event| {
            let _ = app.emit("repo-changed", event);
        })
    })
    .await
}

#[tauri::command]
async fn init_repository(
    state: State<'_, BackendState>,
    app: tauri::AppHandle,
    path: String,
    default_branch: Option<String>,
) -> RpcResult<Session> {
    let state = state.inner().clone();
    run(move || {
        let repo_path = std::path::PathBuf::from(&path);
        gitma_core::git::operations::init_repository(&repo_path, default_branch.as_deref())?;
        state.open(path, move |event| {
            let _ = app.emit("repo-changed", event);
        })
    })
    .await
}

#[tauri::command]
fn startup_options() -> serde_json::Value {
    let args: Vec<_> = std::env::args().collect();
    let repo = args
        .windows(2)
        .find(|pair| pair[0] == "--repo")
        .map(|pair| pair[1].clone());
    let fixture = args
        .windows(2)
        .find(|pair| pair[0] == "--fixture")
        .map(|pair| pair[1].clone());
    serde_json::json!({"repo":repo,"fixture":fixture})
}

#[tauri::command]
async fn get_blame(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
    path: String,
    commit_oid: Option<String>,
) -> RpcResult<BlameResult> {
    let state = state.inner().clone();
    run(move || state.file_blame(&session_id, request_id, &path, commit_oid.as_deref())).await
}

#[tauri::command]
async fn get_file_history(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
    path: String,
    max_count: Option<usize>,
) -> RpcResult<FileHistoryResult> {
    let state = state.inner().clone();
    run(move || state.file_history(&session_id, request_id, &path, max_count)).await
}

#[tauri::command]
async fn get_reflog(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
    limit: Option<usize>,
) -> RpcResult<ReflogResult> {
    let state = state.inner().clone();
    run(move || state.reflog(&session_id, request_id, limit)).await
}

#[tauri::command]
async fn compare_commits(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
    base_oid: String,
    target_oid: String,
) -> RpcResult<CommitFiles> {
    let state = state.inner().clone();
    run(move || state.compare_commits(&session_id, request_id, &base_oid, &target_oid)).await
}

#[tauri::command]
async fn get_remotes(
    state: State<'_, BackendState>,
    session_id: String,
    request_id: u64,
) -> RpcResult<RemotesResult> {
    let state = state.inner().clone();
    run(move || state.get_remotes(&session_id, request_id)).await
}

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(Backend::default()))
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|_, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                gitma_core::git::runner::cancel_all();
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_repository,
            close_repository,
            clone_repository,
            init_repository,
            get_snapshot,
            get_history,
            get_commit_files,
            get_file_preview,
            apply_operation,
            get_blame,
            get_file_history,
            get_reflog,
            compare_commits,
            get_remotes,
            startup_options
        ])
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Gitma");
}
