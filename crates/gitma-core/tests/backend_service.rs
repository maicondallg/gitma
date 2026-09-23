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
    std::fs::write(dir.join(path), text).unwrap();
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
