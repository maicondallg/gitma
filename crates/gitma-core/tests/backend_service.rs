use gitma_core::backend::{Backend, Operation};
use std::path::Path;
use std::process::Command;
use std::sync::mpsc;
use std::time::Duration;
use tempfile::TempDir;

fn git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
fn repo() -> TempDir {
    let dir = TempDir::new().unwrap();
    git(dir.path(), &["init", "-q"]);
    git(
        dir.path(),
        &["config", "user.email", "test@example.invalid"],
    );
    git(dir.path(), &["config", "user.name", "Test"]);
    dir
}
fn commit(dir: &Path, path: &str, text: &str, message: &str) {
    let full = dir.join(path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(&full, text).unwrap();
    git(dir, &["add", "--", path]);
    git(dir, &["commit", "-qm", message]);
}

#[test]
fn file_history_previews_follow_renames_and_show_each_commits_changes() {
    let dir = repo();
    commit(dir.path(), "before.txt", "first\n", "create");
    git(dir.path(), &["mv", "before.txt", "after.txt"]);
    git(dir.path(), &["commit", "-qm", "rename"]);
    commit(dir.path(), "after.txt", "second\n", "edit");

    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();
    let history = backend
        .file_history(&session.session_id, 1, "after.txt", None)
        .unwrap();
    assert_eq!(
        history
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>(),
        vec!["after.txt", "after.txt", "before.txt"]
    );

    let edit = backend
        .file_history_preview(
            &session.session_id,
            2,
            &history.entries[0].oid,
            &history.entries[0].path,
        )
        .unwrap();
    assert_eq!(
        (edit.original.as_str(), edit.modified.as_str()),
        ("first\n", "second\n")
    );
    let rename = backend
        .file_history_preview(
            &session.session_id,
            3,
            &history.entries[1].oid,
            &history.entries[1].path,
        )
        .unwrap();
    assert_eq!(
        (rename.original.as_str(), rename.modified.as_str()),
        ("first\n", "first\n")
    );
    let creation = backend
        .file_history_preview(
            &session.session_id,
            4,
            &history.entries[2].oid,
            &history.entries[2].path,
        )
        .unwrap();
    assert_eq!(
        (creation.original.as_str(), creation.modified.as_str()),
        ("", "first\n")
    );
}

#[test]
fn sessions_keep_file_ids_opaque_and_previews_use_real_sides() {
    let left = repo();
    let right = repo();
    commit(left.path(), "note.txt", "one\n", "first");
    commit(right.path(), "other.txt", "right\n", "first");
    std::fs::write(left.path().join("note.txt"), "two\n").unwrap();

    let backend = Backend::new();
    let first = backend.open(left.path(), |_| {}).unwrap();
    let second = backend.open(right.path(), |_| {}).unwrap();
    let snapshot = backend.snapshot(&first.session_id, 4).unwrap();
    let file = snapshot.unstaged.first().unwrap();
    assert!(!file.id.contains("note.txt"));
    let preview = backend
        .file_preview(&first.session_id, 5, &file.id)
        .unwrap();
    assert_eq!(preview.kind, "text");
    assert_eq!(preview.original, "one\n");
    assert_eq!(preview.modified, "two\n");
    std::fs::write(left.path().join("note.txt"), "changed again\n").unwrap();
    let changed_preview = backend
        .file_preview(&first.session_id, 6, &file.id)
        .unwrap();
    assert_ne!(
        changed_preview.version, preview.version,
        "preview content changes must recreate the editor model"
    );
    std::fs::write(left.path().join("note.txt"), "two\n").unwrap();
    let unchanged = backend.snapshot(&first.session_id, 7).unwrap();
    assert_eq!(
        snapshot.revision, unchanged.revision,
        "identical snapshots retain their identity"
    );
    assert_eq!(
        snapshot.unstaged[0].id, unchanged.unstaged[0].id,
        "file IDs remain stable across snapshots"
    );
    assert!(backend
        .file_preview(&second.session_id, 6, &file.id)
        .is_err());

    backend
        .apply_operation(
            &first.session_id,
            8,
            Operation::Stage,
            std::slice::from_ref(&file.id),
            "",
        )
        .unwrap();
    std::fs::write(left.path().join("note.txt"), "three\n").unwrap();
    let staged = backend.snapshot(&first.session_id, 9).unwrap();
    let staged_preview = backend
        .file_preview(&first.session_id, 10, &staged.staged[0].id)
        .unwrap();
    assert_eq!(
        (staged_preview.original, staged_preview.modified),
        ("one\n".into(), "two\n".into())
    );
    let unstaged_preview = backend
        .file_preview(&first.session_id, 11, &staged.unstaged[0].id)
        .unwrap();
    assert_eq!(
        (unstaged_preview.original, unstaged_preview.modified),
        ("two\n".into(), "three\n".into())
    );
    backend.close(&first.session_id).unwrap();
    backend.close(&second.session_id).unwrap();
}

#[test]
fn commit_preview_handles_root_and_rename_paths() {
    let dir = repo();
    commit(dir.path(), "old.txt", "before\n", "root");
    git(dir.path(), &["mv", "old.txt", "new.txt"]);
    git(dir.path(), &["commit", "-qm", "rename"]);
    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();
    let history = backend.history(&session.session_id, 1, 0, None).unwrap();
    let rename = history.rows.first().unwrap().commit.oid.clone();
    let files = backend
        .commit_files(&session.session_id, 2, &rename)
        .unwrap();
    let file = files
        .files
        .iter()
        .find(|file| file.status == "renamed")
        .unwrap();
    let preview = backend
        .file_preview(&session.session_id, 3, &file.id)
        .unwrap();
    assert_eq!(preview.kind, "text");
    assert_eq!(preview.original, "before\n");
    assert_eq!(preview.modified, "before\n");

    let root = history
        .rows
        .iter()
        .find(|row| row.commit.parents.is_empty())
        .unwrap();
    let root_file = backend
        .commit_files(&session.session_id, 4, &root.commit.oid)
        .unwrap()
        .files
        .remove(0);
    let root_preview = backend
        .file_preview(&session.session_id, 5, &root_file.id)
        .unwrap();
    assert_eq!(root_preview.original, "");
    assert_eq!(root_preview.modified, "before\n");
    backend.close(&session.session_id).unwrap();
}

#[test]
fn deleted_commit_preview_keeps_the_original_side() {
    let dir = repo();
    commit(dir.path(), "removed.txt", "before\n", "add file");
    git(dir.path(), &["rm", "-q", "removed.txt"]);
    git(dir.path(), &["commit", "-qm", "remove file"]);

    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();
    let history = backend.history(&session.session_id, 1, 0, None).unwrap();
    let oid = &history.rows[0].commit.oid;
    let files = backend.commit_files(&session.session_id, 2, oid).unwrap();
    let file = files
        .files
        .iter()
        .find(|file| file.status == "deleted")
        .unwrap();
    let preview = backend
        .file_preview(&session.session_id, 3, &file.id)
        .unwrap();

    assert_eq!(preview.original, "before\n");
    assert_eq!(preview.modified, "");
}

#[test]
fn staged_preview_in_an_unborn_repository_has_an_empty_head_side() {
    let dir = repo();
    std::fs::write(dir.path().join("first.txt"), "first\n").unwrap();
    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();
    let file = backend
        .snapshot(&session.session_id, 1)
        .unwrap()
        .unstaged
        .remove(0);
    backend
        .apply_operation(&session.session_id, 2, Operation::Stage, &[file.id], "")
        .unwrap();
    let staged = backend
        .snapshot(&session.session_id, 3)
        .unwrap()
        .staged
        .remove(0);
    let preview = backend
        .file_preview(&session.session_id, 4, &staged.id)
        .unwrap();
    assert_eq!(preview.kind, "text");
    assert_eq!(preview.original, "");
    assert_eq!(preview.modified, "first\n");
    backend.close(&session.session_id).unwrap();
}

#[test]
fn reads_do_not_touch_index_and_ignored_bursts_do_not_emit() {
    let dir = repo();
    commit(dir.path(), "tracked.txt", "one\n", "initial");
    std::fs::write(dir.path().join(".gitignore"), "ignored.tmp\n").unwrap();
    git(dir.path(), &["add", ".gitignore"]);
    git(dir.path(), &["commit", "-qm", "ignore"]);
    let (tx, rx) = mpsc::channel();
    let backend = Backend::new();
    let session = backend
        .open(dir.path(), move |event| {
            let _ = tx.send(event);
        })
        .unwrap();
    let before = std::fs::metadata(dir.path().join(".git/index"))
        .unwrap()
        .modified()
        .unwrap();
    let _ = backend.snapshot(&session.session_id, 1).unwrap();
    let after = std::fs::metadata(dir.path().join(".git/index"))
        .unwrap()
        .modified()
        .unwrap();
    assert_eq!(before, after, "read commands must not refresh the index");
    if let Ok(event) = rx.recv_timeout(Duration::from_millis(750)) {
        panic!("read commands unexpectedly notified the UI: {event:?}");
    }

    std::fs::write(dir.path().join("ignored.tmp"), "ignored\n").unwrap();
    std::fs::create_dir_all(dir.path().join(".git/objects/test")).unwrap();
    std::fs::write(dir.path().join(".git/objects/test/blob"), b"object").unwrap();
    std::thread::sleep(Duration::from_millis(2300));
    if let Ok(event) = rx.try_recv() {
        panic!("ignored and object writes must not notify the UI: {event:?}");
    }
    std::fs::write(dir.path().join("tracked.txt"), "two\n").unwrap();
    let event = rx
        .recv_timeout(Duration::from_secs(3))
        .expect("tracked worktree edit should notify");
    assert!(matches!(event.scope.as_str(), "worktree" | "all"));
    assert!(
        event.paths.iter().any(|path| path == "tracked.txt"),
        "worktree paths must be relative for UI preview matching: {event:?}"
    );
    std::fs::write(dir.path().join("tracked.txt"), "one\n").unwrap();
    let restored = rx
        .recv_timeout(Duration::from_secs(3))
        .expect("restoring a tracked file to clean must notify");
    assert!(restored.paths.iter().any(|path| path == "tracked.txt"));
    assert!(backend
        .snapshot(&session.session_id, 2)
        .unwrap()
        .unstaged
        .is_empty());
    backend.close(&session.session_id).unwrap();
}

#[test]
fn hunk_operations_via_backend_service() {
    let dir = repo();
    let initial: String = (1..=30).map(|i| format!("line {i}\n")).collect();
    commit(dir.path(), "code.txt", &initial, "initial");
    let modified = initial
        .replace("line 5\n", "line 5 MODIFIED\n")
        .replace("line 25\n", "line 25 MODIFIED\n");
    std::fs::write(dir.path().join("code.txt"), &modified).unwrap();

    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();
    let snap = backend.snapshot(&session.session_id, 1).unwrap();
    assert_eq!(snap.unstaged.len(), 1);

    let preview = backend
        .file_preview(&session.session_id, 2, &snap.unstaged[0].id)
        .unwrap();
    assert_eq!(preview.hunks.len(), 2);

    // Test staging hunk 1 (even if patch string has no trailing newline)
    let patch_trimmed = preview.hunks[1].patch.trim().to_string();
    let res = backend.apply_operation(
        &session.session_id,
        3,
        Operation::StageHunk,
        &[],
        &patch_trimmed,
    );
    assert!(res.is_ok(), "StageHunk with trimmed patch failed: {res:?}");

    let snap_after_stage = backend.snapshot(&session.session_id, 4).unwrap();
    assert_eq!(snap_after_stage.staged.len(), 1);
    assert_eq!(snap_after_stage.unstaged.len(), 1);

    // Unstage the staged hunk
    let staged_preview = backend
        .file_preview(&session.session_id, 5, &snap_after_stage.staged[0].id)
        .unwrap();
    assert_eq!(staged_preview.hunks.len(), 1);
    let res_unstage = backend.apply_operation(
        &session.session_id,
        6,
        Operation::UnstageHunk,
        &[],
        &staged_preview.hunks[0].patch,
    );
    assert!(res_unstage.is_ok(), "UnstageHunk failed: {res_unstage:?}");

    let snap_after_unstage = backend.snapshot(&session.session_id, 7).unwrap();
    assert_eq!(snap_after_unstage.staged.len(), 0);
    assert_eq!(snap_after_unstage.unstaged.len(), 1);

    // Discard hunk 0
    let unstaged_preview = backend
        .file_preview(&session.session_id, 8, &snap_after_unstage.unstaged[0].id)
        .unwrap();
    let res_discard = backend.apply_operation(
        &session.session_id,
        9,
        Operation::DiscardHunk,
        &[],
        &unstaged_preview.hunks[0].patch,
    );
    assert!(res_discard.is_ok(), "DiscardHunk failed: {res_discard:?}");

    backend.close(&session.session_id).unwrap();
}

#[test]
fn git_command_operation_via_backend_service() {
    let dir = repo();
    commit(dir.path(), "file.txt", "line1\n", "initial");

    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();

    // 1. Run git status
    let res = backend.apply_operation(&session.session_id, 1, Operation::GitCommand, &[], "status");
    assert!(res.is_ok());
    let op_res = res.unwrap();
    assert!(
        op_res.message.contains("nothing to commit")
            || op_res.message.contains("clean")
            || op_res.message.contains("branch")
    );

    // 2. Run git branch test-cli
    let res2 = backend.apply_operation(
        &session.session_id,
        2,
        Operation::GitCommand,
        &[],
        "git branch test-cli",
    );
    assert!(res2.is_ok());

    // 3. Verify branch exists via git branch command
    let res3 = backend
        .apply_operation(&session.session_id, 3, Operation::GitCommand, &[], "branch")
        .unwrap();
    assert!(res3.message.contains("test-cli"));

    backend.close(&session.session_id).unwrap();
}

#[test]
fn repo_files_and_repo_preview_work_across_worktree_and_commit() {
    let dir = repo();
    commit(dir.path(), "src/main.rs", "fn main() {}\n", "first commit");
    commit(dir.path(), "docs/readme.md", "# Readme\n", "docs commit");
    std::fs::write(dir.path().join("untracked.txt"), "hello untracked\n").unwrap();

    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();

    // 1. Check repo files at worktree
    let result = backend.repo_files(&session.session_id, 1, None).unwrap();
    let paths: Vec<&str> = result.files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(
        paths,
        vec!["docs/readme.md", "src/main.rs", "untracked.txt"]
    );
    assert!(result.files[0].is_tracked);
    assert!(result.files[1].is_tracked);
    assert!(!result.files[2].is_tracked);

    // 2. Check preview of worktree repo file
    let preview = backend
        .file_preview(&session.session_id, 2, "repo:src/main.rs")
        .unwrap();
    assert_eq!(preview.kind, "text");
    assert_eq!(preview.modified, "fn main() {}\n");

    // 3. Check preview of untracked file
    let untracked_prev = backend
        .file_preview(&session.session_id, 3, "repo:untracked.txt")
        .unwrap();
    assert_eq!(untracked_prev.kind, "text");
    assert_eq!(untracked_prev.modified, "hello untracked\n");

    // 4. Test open_editor operation with JSON payload
    let json_msg = serde_json::json!({
        "path": "src/main.rs",
        "editor": "test-editor"
    })
    .to_string();
    let res = backend.apply_operation(
        &session.session_id,
        4,
        Operation::OpenEditor,
        &[],
        &json_msg,
    );
    assert!(res.is_ok());

    backend.close(&session.session_id).unwrap();
}

#[test]
fn repo_auth_state_can_be_queried_and_persisted() {
    let dir = repo();
    git(
        dir.path(),
        &[
            "remote",
            "add",
            "origin",
            "git@github.com:maicondallg/Gitma.git",
        ],
    );
    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();

    let initial = backend.get_auth_state(&session.session_id, false).unwrap();
    assert_eq!(initial.selected_id, "auto");

    let updated = backend
        .set_repo_account(&session.session_id, "gh:maicondallg")
        .unwrap();
    assert_eq!(updated.selected_id, "gh:maicondallg");
    assert_eq!(updated.resolved_id.as_deref(), Some("gh:maicondallg"));
    assert_eq!(updated.resolution_reason, "manual");

    let reset = backend
        .set_repo_account(&session.session_id, "auto")
        .unwrap();
    assert_eq!(reset.selected_id, "auto");

    backend.close(&session.session_id).unwrap();
}

#[test]
fn conflicted_file_preview_and_block_resolution_work_via_backend() {
    let dir = repo();
    commit(dir.path(), "app.rs", "fn a() {}\nfn b() {}\n", "base");
    git(dir.path(), &["checkout", "-b", "feat"]);
    commit(
        dir.path(),
        "app.rs",
        "fn a_feat() {}\nfn b_feat() {}\n",
        "feat edit",
    );
    git(dir.path(), &["checkout", "-"]);
    commit(
        dir.path(),
        "app.rs",
        "fn a_main() {}\nfn b_main() {}\n",
        "main edit",
    );

    // Trigger merge conflict
    let _ = std::process::Command::new("git")
        .args(["merge", "feat"])
        .current_dir(dir.path())
        .output();

    std::fs::write(
        dir.path().join("app.rs"),
        "<<<<<<< HEAD\nfn a_main() {}\n=======\nfn a_feat() {}\n>>>>>>> feat\n<<<<<<< HEAD\nfn b_main() {}\n=======\nfn b_feat() {}\n>>>>>>> feat\n",
    )
    .unwrap();

    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();
    let snap = backend.snapshot(&session.session_id, 1).unwrap();
    assert!(snap.conflicted);
    assert!(!snap.staged.is_empty());
    assert!(!snap.unstaged.is_empty());

    // Both staged and unstaged entries for a conflicted file must return HEAD as original and worktree conflict markers as modified
    let staged_preview = backend
        .file_preview(&session.session_id, 2, &snap.staged[0].id)
        .unwrap();
    assert_eq!(staged_preview.kind, "conflict");
    assert_eq!(staged_preview.original, "fn a_main() {}\nfn b_main() {}\n");
    assert!(staged_preview.modified.contains("<<<<<<< HEAD"));

    let unstaged_preview = backend
        .file_preview(&session.session_id, 3, &snap.unstaged[0].id)
        .unwrap();
    assert_eq!(unstaged_preview.kind, "conflict");
    assert_eq!(
        unstaged_preview.original,
        "fn a_main() {}\nfn b_main() {}\n"
    );
    assert!(unstaged_preview.modified.contains("<<<<<<< HEAD"));

    // Resolve block 0 with "ours"
    let payload_block0 = serde_json::json!({
        "path": "app.rs",
        "choice": "ours",
        "conflictIndex": 0
    })
    .to_string();
    backend
        .apply_operation(
            &session.session_id,
            4,
            Operation::ResolveConflict,
            &[],
            &payload_block0,
        )
        .unwrap();

    let snap2 = backend.snapshot(&session.session_id, 5).unwrap();
    assert!(snap2.conflicted);

    // Resolve remaining block (index 0) with "theirs"
    let payload_block1 = serde_json::json!({
        "path": "app.rs",
        "choice": "theirs",
        "conflictIndex": 0
    })
    .to_string();
    backend
        .apply_operation(
            &session.session_id,
            6,
            Operation::ResolveConflict,
            &[],
            &payload_block1,
        )
        .unwrap();

    let snap3 = backend.snapshot(&session.session_id, 7).unwrap();
    assert!(!snap3.conflicted);
    assert_eq!(
        std::fs::read_to_string(dir.path().join("app.rs")).unwrap(),
        "fn a_main() {}\nfn b_feat() {}\n"
    );

    backend.close(&session.session_id).unwrap();
}

#[test]
fn stash_with_untracked_files_lists_and_previews_all_files() {
    let dir = repo();
    commit(dir.path(), "tracked.txt", "line 1\n", "initial");

    std::fs::write(dir.path().join("tracked.txt"), "line 1\nline 2\n").unwrap();
    std::fs::write(dir.path().join("untracked_a.txt"), "hello untracked\n").unwrap();
    std::fs::create_dir_all(dir.path().join("src")).unwrap();
    std::fs::write(
        dir.path().join("src/untracked_b.rs"),
        "fn main() {}\n// second line\n",
    )
    .unwrap();

    let backend = Backend::new();
    let session = backend.open(dir.path(), |_| {}).unwrap();

    let stash_payload = serde_json::json!({
        "message": "stash untracked test",
        "include_untracked": true
    })
    .to_string();
    backend
        .apply_operation(
            &session.session_id,
            1,
            Operation::StashPush,
            &[],
            &stash_payload,
        )
        .unwrap();

    let hist = backend
        .history(&session.session_id, 2, 0, Some(true))
        .unwrap();
    let stash_row = hist
        .rows
        .iter()
        .find(|r| r.commit.refs.iter().any(|rf| rf.starts_with("stash@")))
        .expect("stash row should be present in history");
    let stash_oid = &stash_row.commit.oid;

    let commit_files = backend
        .commit_files(&session.session_id, 3, stash_oid)
        .unwrap();
    assert_eq!(commit_files.files.len(), 3);
    assert_eq!(commit_files.stats.files_changed, 3);
    assert_eq!(commit_files.stats.insertions, 4);

    let untracked_a = commit_files
        .files
        .iter()
        .find(|f| f.path_display == "untracked_a.txt")
        .expect("untracked_a.txt must be visible in stash commit_files");
    assert_eq!(untracked_a.status, "added");
    assert_eq!(untracked_a.insertions, Some(1));

    let untracked_b = commit_files
        .files
        .iter()
        .find(|f| f.path_display == "src/untracked_b.rs")
        .expect("src/untracked_b.rs must be visible in stash commit_files");
    assert_eq!(untracked_b.status, "added");
    assert_eq!(untracked_b.insertions, Some(2));

    let preview_a = backend
        .file_preview(&session.session_id, 4, &untracked_a.id)
        .unwrap();
    assert_eq!(preview_a.kind, "text");
    assert_eq!(preview_a.original, "");
    assert_eq!(preview_a.modified, "hello untracked\n");

    let preview_b = backend
        .file_preview(&session.session_id, 5, &untracked_b.id)
        .unwrap();
    assert_eq!(preview_b.kind, "text");
    assert_eq!(preview_b.original, "");
    assert_eq!(preview_b.modified, "fn main() {}\n// second line\n");

    backend.close(&session.session_id).unwrap();
}
