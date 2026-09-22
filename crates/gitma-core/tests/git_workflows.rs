use gitma_core::domain::{DiffLineKind, FileArea, FileDiff, FileStatus};
use gitma_core::git::{self, GitRepository};
use std::path::Path;
use std::process::{Command, Output};
use tempfile::TempDir;

fn git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert_success(args, output);
}

fn git_output(dir: &Path, args: &[&str]) -> Output {
    Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap()
}

fn assert_success(args: &[&str], output: Output) {
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
}

fn repository() -> TempDir {
    let dir = TempDir::new().unwrap();
    git(dir.path(), &["init", "-q"]);
    git(
        dir.path(),
        &["config", "user.email", "test@example.invalid"],
    );
    git(dir.path(), &["config", "user.name", "Test"]);
    dir
}

fn commit_file(dir: &Path, path: &str, contents: &str, message: &str) {
    std::fs::write(dir.join(path), contents).unwrap();
    git(dir, &["add", "--", path]);
    git(dir, &["commit", "-qm", message]);
}

#[test]
fn status_stage_and_commit_preserve_unstaged_content() {
    let dir = repository();
    std::fs::write(dir.path().join("file.txt"), "one\n").unwrap();
    let repo = GitRepository::open(dir.path()).unwrap();
    repo.stage(std::path::Path::new("file.txt")).unwrap();
    std::fs::write(dir.path().join("file.txt"), "one\ntwo\n").unwrap();
    let snapshot = repo.snapshot().unwrap();
    assert_eq!(snapshot.staged[0].area, FileArea::Staged);
    assert_eq!(snapshot.unstaged[0].status, FileStatus::Modified);
    repo.commit("first").unwrap();
    assert_eq!(repo.snapshot().unwrap().unstaged.len(), 1);
}

#[test]
fn empty_history_and_root_diff_are_supported() {
    let dir = repository();
    let repo = GitRepository::open(dir.path()).unwrap();
    assert!(repo.history(0, 20).unwrap().commits.is_empty());
    std::fs::write(dir.path().join("root.txt"), "root\n").unwrap();
    repo.stage(std::path::Path::new("root.txt")).unwrap();
    repo.commit("root").unwrap();
    let oid = repo.history(0, 1).unwrap().commits[0].oid.clone();
    assert!(matches!(
        repo.diff_commit(&oid, None).unwrap(),
        FileDiff::Text { .. }
    ));
}

#[test]
fn untracked_file_has_a_readable_addition_diff() {
    let dir = TempDir::new().unwrap();
    git(dir.path(), &["init", "-q"]);
    let file = dir.path().join("new.txt");
    std::fs::write(&file, "first\nsecond\n").unwrap();
    let repo = GitRepository::open(dir.path()).unwrap();
    match repo
        .diff_local(Some(std::path::Path::new("new.txt")), false)
        .unwrap()
    {
        FileDiff::Text { lines, truncated } => {
            assert!(!truncated);
            assert_eq!(lines.len(), 2);
            assert!(lines.iter().all(|line| line.kind == DiffLineKind::Addition));
            assert_eq!(lines[0].text, "first");
        }
        other => panic!("expected text diff, got {other:?}"),
    }
}

#[test]
fn unstage_works_before_the_first_commit() {
    let dir = repository();
    std::fs::write(dir.path().join("first.txt"), "first\n").unwrap();
    let repo = GitRepository::open(dir.path()).unwrap();
    repo.stage(Path::new("first.txt")).unwrap();
    assert_eq!(repo.snapshot().unwrap().staged.len(), 1);
    repo.unstage(Path::new("first.txt")).unwrap();
    let snapshot = repo.snapshot().unwrap();
    assert!(snapshot.staged.is_empty());
    assert_eq!(snapshot.unstaged[0].status, FileStatus::Untracked);
}

#[test]
fn rename_stage_and_unstage_include_both_paths() {
    let dir = repository();
    commit_file(dir.path(), "old.txt", "original\n", "base");
    git(dir.path(), &["mv", "old.txt", "new.txt"]);
    let repo = GitRepository::open(dir.path()).unwrap();
    let renamed = repo
        .snapshot()
        .unwrap()
        .staged
        .into_iter()
        .find(|file| file.status == FileStatus::Renamed)
        .expect("staged rename");
    assert_eq!(renamed.path, Path::new("new.txt"));
    assert_eq!(renamed.old_path.as_deref(), Some(Path::new("old.txt")));
    repo.stage_file(&renamed).unwrap();
    repo.unstage_file(&renamed).unwrap();
    assert!(repo.snapshot().unwrap().staged.is_empty());
}

#[test]
fn history_handles_multiple_commits_and_detached_head() {
    let dir = repository();
    commit_file(dir.path(), "file.txt", "one\n", "first");
    commit_file(dir.path(), "file.txt", "two\n", "second");
    let repo = GitRepository::open(dir.path()).unwrap();
    let history = repo.history(0, 1).unwrap();
    assert_eq!(history.commits.len(), 1);
    assert!(history.has_more);
    assert_eq!(history.commits[0].subject, "second");
    assert_eq!(history.commits[0].parents.len(), 1);
    git(dir.path(), &["checkout", "--detach", "-q"]);
    assert_eq!(repo.snapshot().unwrap().branch, None);
}

#[test]
fn merge_commit_uses_its_first_parent_for_files_and_diff() {
    let dir = repository();
    commit_file(dir.path(), "base.txt", "base\n", "base");
    git(dir.path(), &["checkout", "-qb", "feature"]);
    commit_file(dir.path(), "feature.txt", "feature\n", "feature");
    git(dir.path(), &["checkout", "-q", "master"]);
    commit_file(dir.path(), "main.txt", "main\n", "main");
    git(
        dir.path(),
        &["merge", "--no-ff", "-qm", "merge feature", "feature"],
    );
    let repo = GitRepository::open(dir.path()).unwrap();
    let merge = repo.history(0, 10).unwrap().commits.remove(0);
    assert_eq!(merge.parents.len(), 2);
    let files = repo.files_for_commit(&merge.oid).unwrap();
    assert!(files
        .iter()
        .any(|file| file.path == Path::new("feature.txt")));
    assert!(!files.iter().any(|file| file.path == Path::new("main.txt")));
    match repo.diff_commit(&merge.oid, None).unwrap() {
        FileDiff::Text { lines, .. } => assert!(lines.iter().any(|line| line.text == "feature")),
        other => panic!("expected text diff, got {other:?}"),
    }
}

#[test]
fn conflict_pairs_are_all_reported_as_conflicted() {
    let raw = b"AA both-added\0DD both-deleted\0AU added-by-us\0UD deleted-by-them\0UA added-by-them\0DU deleted-by-us\0UU both-modified\0";
    let (staged, unstaged, conflicted) = git::status::parse_porcelain_z(raw);
    assert!(conflicted);
    assert_eq!(staged.len(), 7);
    assert_eq!(unstaged.len(), 7);
    assert!(staged
        .iter()
        .chain(&unstaged)
        .all(|file| file.status == FileStatus::Conflicted));
}

#[test]
fn untracked_preview_is_limited_by_line_count() {
    let dir = repository();
    let contents = "line\n".repeat(20_001);
    std::fs::write(dir.path().join("large.txt"), contents).unwrap();
    let repo = GitRepository::open(dir.path()).unwrap();
    match repo
        .diff_local(Some(Path::new("large.txt")), false)
        .unwrap()
    {
        FileDiff::Text { lines, truncated } => {
            assert!(truncated);
            assert_eq!(lines.len(), 20_000);
        }
        other => panic!("expected text diff, got {other:?}"),
    }
}

#[test]
fn bare_remote_fetch_pull_and_push_work() {
    let remote = TempDir::new().unwrap();
    assert_success(
        &["init", "--bare", "-q"],
        Command::new("git")
            .arg("init")
            .arg("--bare")
            .arg("-q")
            .arg(remote.path())
            .output()
            .unwrap(),
    );
    let local = repository();
    commit_file(local.path(), "shared.txt", "one\n", "first");
    git(
        local.path(),
        &["remote", "add", "origin", remote.path().to_str().unwrap()],
    );
    git(local.path(), &["push", "-qu", "origin", "HEAD"]);

    let peer = TempDir::new().unwrap();
    assert_success(
        &["clone"],
        Command::new("git")
            .arg("clone")
            .arg("-q")
            .arg(remote.path())
            .arg(peer.path())
            .output()
            .unwrap(),
    );
    git(
        peer.path(),
        &["config", "user.email", "test@example.invalid"],
    );
    git(peer.path(), &["config", "user.name", "Test"]);
    commit_file(peer.path(), "from-peer.txt", "peer\n", "peer");
    git(peer.path(), &["push", "-q"]);

    let repo = GitRepository::open(local.path()).unwrap();
    repo.fetch().unwrap();
    repo.pull().unwrap();
    assert_eq!(
        std::fs::read_to_string(local.path().join("from-peer.txt")).unwrap(),
        "peer\n"
    );
    commit_file(local.path(), "from-local.txt", "local\n", "local");
    repo.push().unwrap();
    assert_success(&["show"], git_output(peer.path(), &["fetch", "-q"]));
    assert_success(
        &["show"],
        git_output(peer.path(), &["show", "origin/HEAD:from-local.txt"]),
    );
}

#[test]
fn branch_operations_create_checkout_merge_delete() {
    let dir = repository();
    commit_file(dir.path(), "base.txt", "base\n", "base commit");
    let repo = GitRepository::open(dir.path()).unwrap();

    let initial_branch = repo.snapshot().unwrap().branch.unwrap();
    let initial_history_key = repo.history_key().unwrap();

    // Cria nova branch a partir de HEAD sem dar checkout
    repo.create_branch("feature-1", None, false).unwrap();
    // Faz checkout para a branch no mesmo commit
    repo.checkout_branch("feature-1").unwrap();
    assert_eq!(
        repo.snapshot().unwrap().branch.as_deref(),
        Some("feature-1")
    );
    let feature_history_key = repo.history_key().unwrap();
    assert_ne!(
        initial_history_key, feature_history_key,
        "history_key deve mudar ao alternar de branch mesmo no mesmo commit"
    );

    // Comita na nova branch
    commit_file(dir.path(), "feature.txt", "feat\n", "feature commit");

    // Volta para a branch inicial
    repo.checkout_branch(&initial_branch).unwrap();
    assert_eq!(
        repo.snapshot().unwrap().branch.as_deref(),
        Some(initial_branch.as_str())
    );

    // Faz merge da branch feature-1
    repo.merge_branch("feature-1").unwrap();
    assert!(dir.path().join("feature.txt").exists());

    // Deleta a branch feature-1
    repo.delete_branch("feature-1", false).unwrap();
}

#[test]
fn commit_amend_updates_last_commit() {
    let dir = repository();
    commit_file(dir.path(), "base.txt", "v1\n", "initial commit");
    let repo = GitRepository::open(dir.path()).unwrap();

    let initial_commit_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    // Adiciona arquivo e emenda o commit com nova mensagem
    std::fs::write(dir.path().join("extra.txt"), "extra content\n").unwrap();
    let file = repo
        .snapshot()
        .unwrap()
        .unstaged
        .into_iter()
        .find(|f| f.path == Path::new("extra.txt"))
        .unwrap();
    repo.stage_file(&file).unwrap();

    let res = repo.commit_amend("amended commit message").unwrap();
    assert!(!res.is_empty());

    let updated_history = repo.history(0, 1).unwrap();
    assert_eq!(updated_history.commits[0].subject, "amended commit message");
    // O oid do commit mudou (novo commit emendado)
    assert_ne!(updated_history.commits[0].oid, initial_commit_oid);
    // Mas o número de commits continua sendo 1 (não gerou um segundo commit)
    assert_eq!(repo.history(0, 10).unwrap().commits.len(), 1);
}

#[test]
fn push_force_with_lease_succeeds() {
    let remote = TempDir::new().unwrap();
    assert_success(
        &["init", "--bare", "-q"],
        Command::new("git")
            .arg("init")
            .arg("--bare")
            .arg("-q")
            .arg(remote.path())
            .output()
            .unwrap(),
    );
    let local = repository();
    commit_file(local.path(), "test.txt", "hello\n", "initial");
    git(
        local.path(),
        &["remote", "add", "origin", remote.path().to_str().unwrap()],
    );
    git(local.path(), &["push", "-qu", "origin", "HEAD"]);

    let repo = GitRepository::open(local.path()).unwrap();

    // Emenda o commit localmente
    repo.commit_amend("amended message").unwrap();

    // Push com force-with-lease deve funcionar
    repo.push_force_with_lease().unwrap();
    let history = repo.history(0, 1).unwrap();
    assert_eq!(history.commits[0].subject, "amended message");
}

#[test]
fn stash_operations_push_pop_apply_drop() {
    let local = repository();
    commit_file(local.path(), "file.txt", "initial\n", "initial");
    let repo = GitRepository::open(local.path()).unwrap();

    // Modify file and add untracked file
    std::fs::write(local.path().join("file.txt"), "modified\n").unwrap();
    std::fs::write(local.path().join("untracked.txt"), "new file\n").unwrap();

    // Stash with untracked
    repo.stash_push(Some("work in progress"), true).unwrap();

    // Worktree should be clean now
    let snap = repo.snapshot().unwrap();
    assert!(snap.unstaged.is_empty());
    assert!(snap.staged.is_empty());

    // Apply stash
    repo.stash_apply(None).unwrap();
    let snap2 = repo.snapshot().unwrap();
    assert_eq!(snap2.unstaged.len(), 2);

    // Drop stash
    repo.stash_drop(None).unwrap();
}

#[test]
fn multiple_stashes_on_same_commit_are_all_visible_and_droppable() {
    let local = repository();
    commit_file(local.path(), "file.txt", "initial\n", "initial");
    let repo = GitRepository::open(local.path()).unwrap();

    // First stash
    std::fs::write(local.path().join("file.txt"), "stash 1 content\n").unwrap();
    repo.stash_push(Some("stash 1"), false).unwrap();

    // Second stash on the same commit
    std::fs::write(local.path().join("file.txt"), "stash 2 content\n").unwrap();
    repo.stash_push(Some("stash 2"), false).unwrap();

    // History should contain both stashes with stash@{0} and stash@{1}
    let hist = repo.history(0, 50).unwrap();
    let stash_commits: Vec<_> = hist
        .commits
        .iter()
        .filter(|c| c.refs.iter().any(|r| r.starts_with("stash@")))
        .collect();
    assert_eq!(stash_commits.len(), 2);

    let stash0 = stash_commits
        .iter()
        .find(|c| c.refs.contains(&"stash@{0}".to_string()))
        .unwrap();
    let stash1 = stash_commits
        .iter()
        .find(|c| c.refs.contains(&"stash@{1}".to_string()))
        .unwrap();
    assert!(stash0.subject.contains("stash 2"));
    assert!(stash1.subject.contains("stash 1"));

    // Dropping stash@{1} with explicit ref succeeds
    repo.stash_drop(Some("stash@{1}")).unwrap();

    // Now only 1 stash remains
    let hist_after = repo.history(0, 50).unwrap();
    let remaining_stashes: Vec<_> = hist_after
        .commits
        .iter()
        .filter(|c| c.refs.iter().any(|r| r.starts_with("stash@")))
        .collect();
    assert_eq!(remaining_stashes.len(), 1);
    assert_eq!(remaining_stashes[0].refs, vec!["stash@{0}"]);

    // Dropping stash with "stash" or "refs/stash" also succeeds (defaults to latest)
    repo.stash_drop(Some("stash")).unwrap();
}

#[test]
fn cherry_pick_applies_specified_commit() {
    let local = repository();
    commit_file(local.path(), "a.txt", "a\n", "commit A");
    let repo = GitRepository::open(local.path()).unwrap();
    let initial_branch = repo.snapshot().unwrap().branch.unwrap();

    // Create feature branch and make commit B
    repo.create_branch("feature", None, true).unwrap();
    commit_file(local.path(), "b.txt", "b\n", "commit B");
    let feature_history = repo.history(0, 1).unwrap();
    let commit_b_oid = feature_history.commits[0].oid.clone();

    // Checkout initial branch and cherry-pick commit B
    repo.checkout_branch(&initial_branch).unwrap();
    repo.cherry_pick(&commit_b_oid).unwrap();

    let updated_history = repo.history(0, 1).unwrap();
    assert_eq!(updated_history.commits[0].subject, "commit B");
    assert!(local.path().join("b.txt").exists());
}

#[test]
fn delete_remote_branch_works() {
    let remote = TempDir::new().unwrap();
    assert_success(
        &["init", "--bare", "-q"],
        Command::new("git")
            .arg("init")
            .arg("--bare")
            .arg("-q")
            .arg(remote.path())
            .output()
            .unwrap(),
    );
    let local = repository();
    commit_file(local.path(), "test.txt", "hello\n", "initial");
    git(
        local.path(),
        &["remote", "add", "origin", remote.path().to_str().unwrap()],
    );
    git(local.path(), &["push", "-qu", "origin", "HEAD"]);

    let repo = GitRepository::open(local.path()).unwrap();
    repo.create_branch("feature-rem", None, true).unwrap();
    git(local.path(), &["push", "-qu", "origin", "feature-rem"]);

    // Verify remote branch exists
    let remote_refs = git_output(
        local.path(),
        &["ls-remote", "--heads", "origin", "feature-rem"],
    );
    assert!(String::from_utf8_lossy(&remote_refs.stdout).contains("refs/heads/feature-rem"));

    // Delete remote branch
    repo.delete_remote_branch("origin/feature-rem").unwrap();

    // Verify remote branch is deleted
    let remote_refs_after = git_output(
        local.path(),
        &["ls-remote", "--heads", "origin", "feature-rem"],
    );
    assert!(!String::from_utf8_lossy(&remote_refs_after.stdout).contains("refs/heads/feature-rem"));
}

#[test]
fn checkout_remote_branch_creates_local_branch_with_tracking() {
    let remote = TempDir::new().unwrap();
    assert_success(
        &["init", "--bare", "-q"],
        Command::new("git")
            .arg("init")
            .arg("--bare")
            .arg("-q")
            .arg(remote.path())
            .output()
            .unwrap(),
    );
    let dev = repository();
    commit_file(dev.path(), "base.txt", "v1\n", "initial");
    git(
        dev.path(),
        &["remote", "add", "origin", remote.path().to_str().unwrap()],
    );
    git(dev.path(), &["push", "-qu", "origin", "HEAD"]);
    git(dev.path(), &["checkout", "-b", "remote-feat"]);
    commit_file(dev.path(), "feat.txt", "feat\n", "feature commit");
    git(dev.path(), &["push", "-qu", "origin", "remote-feat"]);

    // Client repo clones from remote
    let client_dir = TempDir::new().unwrap();
    assert_success(
        &["clone", "-q"],
        Command::new("git")
            .arg("clone")
            .arg("-q")
            .arg(remote.path())
            .arg(client_dir.path())
            .output()
            .unwrap(),
    );
    git(client_dir.path(), &["config", "user.name", "Tester"]);
    git(
        client_dir.path(),
        &["config", "user.email", "test@test.com"],
    );

    let repo = GitRepository::open(client_dir.path()).unwrap();
    // Initial branch is not remote-feat
    assert_ne!(
        repo.snapshot().unwrap().branch.as_deref(),
        Some("remote-feat")
    );

    // Checkout remote branch origin/remote-feat
    repo.checkout_branch("origin/remote-feat").unwrap();

    // Must be on local branch remote-feat (NOT detached HEAD!)
    let snap = repo.snapshot().unwrap();
    assert_eq!(snap.branch.as_deref(), Some("remote-feat"));
    assert!(client_dir.path().join("feat.txt").exists());

    // Switch away and checkout again (when local branch already exists)
    repo.checkout_branch("master")
        .or_else(|_| repo.checkout_branch("main"))
        .unwrap();
    assert_ne!(
        repo.snapshot().unwrap().branch.as_deref(),
        Some("remote-feat")
    );

    repo.checkout_branch("origin/remote-feat").unwrap();
    assert_eq!(
        repo.snapshot().unwrap().branch.as_deref(),
        Some("remote-feat")
    );
}

#[test]
fn delete_unmerged_branch_with_force_succeeds() {
    let dir = repository();
    commit_file(dir.path(), "base.txt", "v1\n", "initial commit");
    let repo = GitRepository::open(dir.path()).unwrap();
    let initial_branch = repo.snapshot().unwrap().branch.unwrap();

    // Create a branch with an unmerged commit
    repo.create_branch("unmerged-branch", None, true).unwrap();
    commit_file(dir.path(), "unmerged.txt", "content\n", "unmerged commit");

    // Switch back to initial branch
    repo.checkout_branch(&initial_branch).unwrap();

    // Deleting without force should fail because it's not merged
    assert!(repo.delete_branch("unmerged-branch", false).is_err());

    // Deleting with force=true must succeed
    repo.delete_branch("unmerged-branch", true).unwrap();

    // Verify branch no longer exists
    let branches = git_output(dir.path(), &["branch"]);
    assert!(!String::from_utf8_lossy(&branches.stdout).contains("unmerged-branch"));
}

#[test]
fn reset_head_works_for_soft_mixed_and_hard() {
    let dir = repository();
    commit_file(dir.path(), "file1.txt", "first\n", "commit 1");
    let repo = GitRepository::open(dir.path()).unwrap();
    let c1_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    commit_file(dir.path(), "file2.txt", "second\n", "commit 2");
    let _c2_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    // 1. Soft reset to c1: HEAD moves to c1, file2 changes are staged
    repo.reset_head(&c1_oid, "soft").unwrap();
    let hist = repo.history(0, 1).unwrap();
    assert_eq!(hist.commits[0].oid, c1_oid);
    let snap = repo.snapshot().unwrap();
    assert!(
        !snap.staged.is_empty(),
        "Soft reset should leave changes in staged"
    );

    // Re-commit to advance again
    repo.commit("commit 2 again").unwrap();

    // 2. Mixed reset to c1: HEAD moves to c1, file2 changes are unstaged
    repo.reset_head(&c1_oid, "mixed").unwrap();
    let hist2 = repo.history(0, 1).unwrap();
    assert_eq!(hist2.commits[0].oid, c1_oid);
    let snap2 = repo.snapshot().unwrap();
    assert!(snap2.staged.is_empty(), "Mixed reset should unstage");
    assert!(
        !snap2.unstaged.is_empty(),
        "Mixed reset should keep working tree changes"
    );

    // Re-stage and commit file2 so it's tracked in a new commit
    let file2_entry = snap2
        .unstaged
        .into_iter()
        .find(|f| f.path == Path::new("file2.txt"))
        .unwrap();
    repo.stage_file(&file2_entry).unwrap();
    repo.commit("commit 2 yet again").unwrap();
    assert_eq!(repo.history(0, 10).unwrap().commits.len(), 2);

    // 3. Hard reset to c1: discards tracked changes from commit 2
    repo.reset_head(&c1_oid, "hard").unwrap();
    let snap3 = repo.snapshot().unwrap();
    assert!(snap3.staged.is_empty());
    assert!(
        snap3.unstaged.is_empty(),
        "Hard reset should discard changes"
    );
    assert!(
        !dir.path().join("file2.txt").exists(),
        "file2 should be deleted on hard reset"
    );
}

#[test]
fn discard_operations_restore_tracked_and_clean_untracked() {
    let dir = repository();
    commit_file(dir.path(), "tracked.txt", "original\n", "initial commit");
    let repo = GitRepository::open(dir.path()).unwrap();

    // 1. Modify tracked file and create untracked file
    std::fs::write(dir.path().join("tracked.txt"), "modified\n").unwrap();
    std::fs::write(dir.path().join("untracked.txt"), "untracked content\n").unwrap();

    let snap = repo.snapshot().unwrap();
    assert_eq!(snap.unstaged.len(), 2);

    // Discard single untracked file
    let untracked_entry = snap
        .unstaged
        .iter()
        .find(|f| f.path == Path::new("untracked.txt"))
        .unwrap();
    repo.discard_file(untracked_entry).unwrap();
    assert!(!dir.path().join("untracked.txt").exists());

    // Discard single tracked file
    let tracked_entry = snap
        .unstaged
        .iter()
        .find(|f| f.path == Path::new("tracked.txt"))
        .unwrap();
    repo.discard_file(tracked_entry).unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.path().join("tracked.txt")).unwrap(),
        "original\n"
    );

    // 2. Test discard_all_unstaged
    std::fs::write(dir.path().join("tracked.txt"), "modified again\n").unwrap();
    std::fs::write(dir.path().join("untracked2.txt"), "untracked 2\n").unwrap();
    assert_eq!(repo.snapshot().unwrap().unstaged.len(), 2);

    repo.discard_all_unstaged().unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.path().join("tracked.txt")).unwrap(),
        "original\n"
    );
    assert!(!dir.path().join("untracked2.txt").exists());
    assert!(repo.snapshot().unwrap().unstaged.is_empty());
}

#[test]
fn revert_commit_creates_inverse_commit() {
    let dir = repository();
    commit_file(dir.path(), "base.txt", "base\n", "base commit");
    let repo = GitRepository::open(dir.path()).unwrap();

    commit_file(
        dir.path(),
        "feature.txt",
        "feature content\n",
        "add feature",
    );
    let feat_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    // Revert feature commit
    repo.revert_commit(&feat_oid).unwrap();
    let history = repo.history(0, 5).unwrap();
    assert_eq!(history.commits.len(), 3);
    assert!(history.commits[0]
        .subject
        .starts_with("Revert \"add feature\""));
    assert!(!dir.path().join("feature.txt").exists());
}

#[test]
fn tag_operations_create_and_delete() {
    let dir = repository();
    commit_file(dir.path(), "file.txt", "content\n", "initial commit");
    let repo = GitRepository::open(dir.path()).unwrap();
    let head_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    // 1. Create lightweight tag
    repo.create_tag("v1.0.0", Some(&head_oid), None, false)
        .unwrap();
    let hist = repo.history(0, 1).unwrap();
    assert!(hist.commits[0].refs.iter().any(|r| r.contains("v1.0.0")));

    // 2. Create annotated tag
    repo.create_tag("v1.1.0", Some(&head_oid), Some("Release 1.1.0"), false)
        .unwrap();
    let hist2 = repo.history(0, 1).unwrap();
    assert!(hist2.commits[0].refs.iter().any(|r| r.contains("v1.1.0")));

    // 3. Delete tag with prefix
    repo.delete_tag("refs/tags/v1.0.0", false, None).unwrap();
    let hist3 = repo.history(0, 1).unwrap();
    assert!(!hist3.commits[0].refs.iter().any(|r| r.contains("v1.0.0")));
    assert!(hist3.commits[0].refs.iter().any(|r| r.contains("v1.1.0")));

    // 4. Delete tag via delete_branch redirection
    repo.delete_branch("refs/tags/v1.1.0", false).unwrap();
    let hist4 = repo.history(0, 1).unwrap();
    assert!(!hist4.commits[0].refs.iter().any(|r| r.contains("v1.1.0")));

    // 5. Delete tag via JSON string (fallback handling)
    repo.create_tag("v1.2.0", Some(&head_oid), None, false)
        .unwrap();
    repo.delete_tag(r#"{"name":"v1.2.0","deleteRemote":{}}"#, false, None)
        .unwrap();
    let hist5 = repo.history(0, 1).unwrap();
    assert!(!hist5.commits[0].refs.iter().any(|r| r.contains("v1.2.0")));

    // 6. Test tag force move
    commit_file(dir.path(), "file2.txt", "second\n", "second commit");
    let second_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();
    repo.create_tag("v1.3.0", Some(&head_oid), None, false)
        .unwrap();
    // Overwriting without force should fail
    assert!(repo
        .create_tag("v1.3.0", Some(&second_oid), None, false)
        .is_err());
    // Overwriting with force should succeed
    assert!(repo
        .create_tag("v1.3.0", Some(&second_oid), None, true)
        .is_ok());
    let hist6 = repo.history(0, 1).unwrap();
    assert!(hist6.commits[0].refs.iter().any(|r| r.contains("v1.3.0")));
}

#[test]
fn tag_operations_checkout_and_push() {
    let remote = TempDir::new().unwrap();
    assert_success(
        &["init", "--bare", "-q"],
        Command::new("git")
            .arg("init")
            .arg("--bare")
            .arg("-q")
            .arg(remote.path())
            .output()
            .unwrap(),
    );

    let dir = repository();
    commit_file(dir.path(), "file.txt", "content\n", "initial commit");
    assert_success(
        &["remote", "add", "origin"],
        Command::new("git")
            .arg("-C")
            .arg(dir.path())
            .args(["remote", "add", "origin"])
            .arg(remote.path())
            .output()
            .unwrap(),
    );

    let repo = GitRepository::open(dir.path()).unwrap();
    let head_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    // Create tag
    repo.create_tag("v2.0.0", Some(&head_oid), None, false)
        .unwrap();

    // Checkout tag with 'tag: ' prefix (detached HEAD)
    repo.checkout_branch("tag: v2.0.0").unwrap();
    let snap = repo.snapshot().unwrap();
    assert!(snap.branch.is_none());

    // Push tag to remote
    repo.push_tag("v2.0.0", None, false).unwrap();

    // Verify remote has the tag
    let remote_refs = Command::new("git")
        .arg("--git-dir")
        .arg(remote.path())
        .args(["tag", "-l"])
        .output()
        .unwrap();
    let remote_tags = String::from_utf8_lossy(&remote_refs.stdout);
    assert!(remote_tags.contains("v2.0.0"));
}

#[test]
fn rebase_operations_and_in_progress_detection() {
    let dir = repository();
    commit_file(dir.path(), "base.txt", "base\n", "base commit");
    let repo = GitRepository::open(dir.path()).unwrap();

    // Create feature branch
    repo.create_branch("feature", None, true).unwrap();
    commit_file(dir.path(), "feat.txt", "feat\n", "feat commit");

    // Checkout main and make commit
    let main_branch = repo.snapshot().unwrap().branch.unwrap();
    let target = if main_branch == "main" {
        "master"
    } else {
        "main"
    };
    let initial_branch = if git_output(dir.path(), &["branch", "--show-current"])
        .stdout
        .starts_with(b"main")
    {
        "main"
    } else {
        "master"
    };
    let _ = target;
    repo.checkout_branch(initial_branch).unwrap();
    commit_file(dir.path(), "main_work.txt", "work\n", "main work");

    // Checkout feature and rebase onto main
    repo.checkout_branch("feature").unwrap();
    repo.rebase(initial_branch).unwrap();

    // History of feature should now have both commits
    let hist = repo.history(0, 5).unwrap();
    assert_eq!(hist.commits.len(), 3);

    // In progress should be None for clean rebase
    let snap = repo.snapshot().unwrap();
    assert!(snap.in_progress.is_none());
}

#[test]
fn init_repository_creates_new_git_repo_with_branch() {
    let temp = TempDir::new().unwrap();
    let new_repo_path = temp.path().join("subfolder/my-new-repo");
    git::operations::init_repository(&new_repo_path, Some("main")).unwrap();
    assert!(new_repo_path.join(".git").exists());
    let repo = GitRepository::open(&new_repo_path).unwrap();
    let snap = repo.snapshot().unwrap();
    assert_eq!(snap.branch.as_deref(), Some("main"));
}

#[test]
fn clone_repository_clones_local_repo() {
    let source_dir = repository();
    commit_file(
        source_dir.path(),
        "test.txt",
        "hello clone\n",
        "Initial commit",
    );
    let temp = TempDir::new().unwrap();
    let cloned_path = temp.path().join("cloned-repo");
    git::operations::clone_repository(source_dir.path().to_str().unwrap(), &cloned_path).unwrap();
    assert!(cloned_path.join(".git").exists());
    let repo = GitRepository::open(&cloned_path).unwrap();
    let snap = repo.snapshot().unwrap();
    assert!(snap.staged.is_empty());
    assert!(snap.unstaged.is_empty());
    let hist = repo.history(0, 10).unwrap();
    assert_eq!(hist.commits.len(), 1);
    assert_eq!(hist.commits[0].subject, "Initial commit");
}

#[test]
fn commit_files_and_snapshot_contain_numstat() {
    let dir = repository();
    commit_file(
        dir.path(),
        "file1.txt",
        "line 1\nline 2\nline 3\n",
        "Add file1",
    );
    let repo = GitRepository::open(dir.path()).unwrap();
    let hist = repo.history(0, 1).unwrap();
    let first_oid = &hist.commits[0].oid;
    let files = repo.files_for_commit(first_oid).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, std::path::PathBuf::from("file1.txt"));
    assert_eq!(files[0].insertions, Some(3));
    assert_eq!(files[0].deletions, Some(0));

    // Modify file and check snapshot
    std::fs::write(dir.path().join("file1.txt"), "line 1\nnew line\n").unwrap();
    let snap = repo.snapshot().unwrap();
    assert_eq!(snap.unstaged.len(), 1);
    assert_eq!(snap.unstaged[0].insertions, Some(1));
    assert_eq!(snap.unstaged[0].deletions, Some(2));
}

#[test]
fn hunk_staging_and_discard_workflows() {
    use gitma_core::git::operations::PatchTarget;

    let dir = repository();
    let mut initial = String::new();
    for i in 1..=50 {
        initial.push_str(&format!("line {}\n", i));
    }
    commit_file(dir.path(), "code.txt", &initial, "Initial commit");
    let repo = GitRepository::open(dir.path()).unwrap();

    // Modify two far-apart lines (line 5 and line 45)
    let mut modified = initial.replace("line 5\n", "line 5 MODIFIED\n");
    modified = modified.replace("line 45\n", "line 45 MODIFIED\n");
    std::fs::write(dir.path().join("code.txt"), &modified).unwrap();

    let snap = repo.snapshot().unwrap();
    assert_eq!(snap.unstaged.len(), 1);
    let file = &snap.unstaged[0];

    // Compute hunks
    let hunks = repo.file_hunks(file).unwrap();
    assert_eq!(hunks.len(), 2);
    assert!(hunks[0].header.contains("@@"));
    assert!(hunks[1].header.contains("@@"));

    // Stage only hunk 1 (the line 45 modification)
    repo.apply_patch(&hunks[1].patch, PatchTarget::Stage)
        .unwrap();

    let snap_after_stage = repo.snapshot().unwrap();
    assert_eq!(snap_after_stage.staged.len(), 1);
    assert_eq!(snap_after_stage.unstaged.len(), 1);

    // Now compute hunks on unstaged (should now only have 1 hunk: line 5)
    let unstaged_hunks = repo.file_hunks(&snap_after_stage.unstaged[0]).unwrap();
    assert_eq!(unstaged_hunks.len(), 1);

    // Discard unstaged hunk 0 (line 5)
    repo.apply_patch(&unstaged_hunks[0].patch, PatchTarget::Discard)
        .unwrap();

    let snap_after_discard = repo.snapshot().unwrap();
    assert_eq!(snap_after_discard.unstaged.len(), 0);
    assert_eq!(snap_after_discard.staged.len(), 1);

    // Unstage the staged hunk
    let staged_hunks = repo.file_hunks(&snap_after_discard.staged[0]).unwrap();
    assert_eq!(staged_hunks.len(), 1);
    repo.apply_patch(&staged_hunks[0].patch, PatchTarget::Unstage)
        .unwrap();

    let snap_after_unstage = repo.snapshot().unwrap();
    assert_eq!(snap_after_unstage.staged.len(), 0);
    assert_eq!(snap_after_unstage.unstaged.len(), 1);
}

#[test]
fn add_to_gitignore_works() {
    let dir = repository();
    let repo = GitRepository::open(dir.path()).unwrap();

    repo.add_to_gitignore("*.log").unwrap();
    repo.add_to_gitignore("target/").unwrap();
    // Adding duplicate pattern should be a no-op
    repo.add_to_gitignore("*.log").unwrap();

    let content = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
    assert_eq!(content, "*.log\ntarget/\n");
}

#[test]
fn commit_details_and_file_history_and_blame_and_reflog_work() {
    let dir = repository();
    let repo = GitRepository::open(dir.path()).unwrap();

    commit_file(
        dir.path(),
        "code.rs",
        "fn main() {\n    println!(\"hello\");\n}\n",
        "feat: initial commit\n\nDetailed explanation of why we wrote hello world.",
    );
    let c1_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    // 1. Test commit_details
    let details = repo.commit_details(&c1_oid).unwrap();
    assert_eq!(details.oid, c1_oid);
    assert_eq!(details.subject, "feat: initial commit");
    assert!(details.body.contains("Detailed explanation"));
    assert!(!details.author_name.is_empty());

    // 2. Test file_blame
    let blame = repo.file_blame("code.rs", None).unwrap();
    assert_eq!(blame.len(), 3);
    assert_eq!(blame[0].commit_oid, c1_oid);
    assert_eq!(blame[0].summary, "feat: initial commit");

    // 3. Second commit
    commit_file(
        dir.path(),
        "code.rs",
        "fn main() {\n    println!(\"hello world\");\n}\n",
        "fix: change greeting",
    );
    let c2_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    // Test file_history
    let history = repo.file_history("code.rs", 10).unwrap();
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].oid, c2_oid);
    assert_eq!(history[1].oid, c1_oid);

    // 4. Test reflog
    let reflog = repo.reflog(10).unwrap();
    assert!(!reflog.is_empty());
    assert_eq!(reflog[0].oid, c2_oid);
}

#[test]
fn remote_management_and_arbitrary_compare_work() {
    let dir = repository();
    let repo = GitRepository::open(dir.path()).unwrap();
    commit_file(dir.path(), "f1.txt", "v1\n", "c1");
    let c1_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    commit_file(dir.path(), "f2.txt", "v2\n", "c2");
    let c2_oid = repo.history(0, 1).unwrap().commits[0].oid.clone();

    // 1. Arbitrary compare between c1 and c2
    let diff_files = repo.files_between_commits(&c1_oid, &c2_oid).unwrap();
    assert_eq!(diff_files.len(), 1);
    assert_eq!(diff_files[0].path, Path::new("f2.txt"));
    assert_eq!(diff_files[0].status, FileStatus::Added);
    assert_eq!(diff_files[0].insertions, Some(1));

    // 2. Remote management
    repo.add_remote("origin", "https://github.com/example/repo.git")
        .unwrap();
    let remotes = repo.get_remotes().unwrap();
    assert_eq!(remotes.len(), 1);
    assert_eq!(remotes[0].name, "origin");
    assert_eq!(remotes[0].fetch_url, "https://github.com/example/repo.git");

    repo.set_remote_url("origin", "https://github.com/example/updated.git")
        .unwrap();
    let remotes_updated = repo.get_remotes().unwrap();
    assert_eq!(
        remotes_updated[0].fetch_url,
        "https://github.com/example/updated.git"
    );

    repo.remove_remote("origin").unwrap();
    let remotes_empty = repo.get_remotes().unwrap();
    assert!(remotes_empty.is_empty());
}

#[test]
fn conflict_resolution_operations_work() {
    let dir = repository();
    let repo = GitRepository::open(dir.path()).unwrap();
    commit_file(dir.path(), "shared.txt", "line 1\n", "base");

    let initial_branch = repo.snapshot().unwrap().branch.unwrap();
    git(dir.path(), &["checkout", "-b", "feature"]);
    commit_file(dir.path(), "shared.txt", "line 1 feature\n", "feature edit");

    git(dir.path(), &["checkout", &initial_branch]);
    commit_file(dir.path(), "shared.txt", "line 1 main\n", "main edit");

    // Merge feature -> triggers conflict
    let _ = git_output(dir.path(), &["merge", "feature"]);
    let snapshot = repo.snapshot().unwrap();
    assert!(snapshot.conflicted);

    // Test resolve with "ours"
    repo.resolve_conflict("shared.txt", "ours").unwrap();
    let content = std::fs::read_to_string(dir.path().join("shared.txt")).unwrap();
    assert_eq!(content, "line 1 main\n");
}
