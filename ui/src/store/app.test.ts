import { describe, expect, it, vi } from 'vitest';
import type { CommitFiles, Preview } from '../lib/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function setup() {
  vi.resetModules();
  const { useAppStore: store } = await import('./app');
  const bridge = await import('../lib/bridge');
  const { createFixtureAdapter } = await import('../lib/fixtures');
  const adapter = createFixtureAdapter('local');
  bridge.setBridgeAdapter(adapter);
  await store.getState().openRepository('/demo');
  return { store, adapter };
}

describe('repository state coordination', () => {
  it('retains an open diff and draft when preview revalidation fails', async () => {
    const { store, adapter } = await setup();
    await store.getState().selectFile(store.getState().snapshot!.unstaged[0]);
    const before = store.getState().preview;
    store.getState().setCommitMessage('Unfinished draft');
    adapter.getFilePreview = async () => { throw { category: 'git', message: 'Temporary read failure' }; };
    await store.getState().refresh('manual');
    await Promise.resolve(); await Promise.resolve();
    expect(store.getState().preview).toBe(before);
    expect(store.getState().notice?.message).toBe('Temporary read failure');
    expect(store.getState().commitMessage).toBe('Unfinished draft');
  });

  it('prevents commit writes while browsing history', async () => {
    const { store, adapter } = await setup();
    store.getState().setCommitMessage('Local draft');
    await store.getState().selectCommit(store.getState().history!.rows[0].commit.oid);
    const write = vi.spyOn(adapter, 'applyOperation');
    await store.getState().runOperation('commit');
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps snapshot, editor data, selection, message and errors stable on an unchanged refresh', async () => {
    const { store, adapter } = await setup();
    await store.getState().selectFile(store.getState().snapshot!.unstaged[0]);
    store.getState().setCommitMessage('Keep my draft');
    store.getState().setDiffMode('split');
    store.setState({ notice: { category: 'authentication', message: 'Authentication failed' } });
    const before = store.getState();
    const history = vi.spyOn(adapter, 'getHistory');
    await store.getState().refresh('manual');
    await Promise.resolve();
    const after = store.getState();
    expect(after.snapshot).toBe(before.snapshot);
    expect(after.preview).toBe(before.preview);
    expect(after.selectedFile).toBe(before.selectedFile);
    expect(after.commitMessage).toBe('Keep my draft');
    expect(after.diffMode).toBe('split');
    expect(after.notice).toBe(before.notice);
    expect(history).not.toHaveBeenCalled();
  });

  it('ignores an older preview of the same selected file after revalidation', async () => {
    const { store, adapter } = await setup();
    const first = deferred<Preview>();
    const second = deferred<Preview>();
    const calls: number[] = [];
    adapter.getFilePreview = async (_session, requestId) => { calls.push(requestId); return calls.length === 1 ? first.promise : second.promise; };
    const file = store.getState().snapshot!.unstaged[0];
    const selected = store.getState().selectFile(file);
    await store.getState().refresh('manual');
    const preview = (version: string, requestId: number): Preview => ({ sessionId: 'demo-session', requestId, fileId: file.id, version, kind: 'text', original: 'before', modified: version, message: null });
    second.resolve(preview('latest', calls[1]));
    await Promise.resolve(); await Promise.resolve();
    first.resolve(preview('outdated', calls[0]));
    await selected;
    expect(store.getState().preview?.modified).toBe('latest');
  });

  it('does not apply an old commit-file request after leaving and returning to the same commit', async () => {
    const { store, adapter } = await setup();
    const first = deferred<CommitFiles>();
    const second = deferred<CommitFiles>();
    const ids: number[] = [];
    adapter.getCommitFiles = async (_session, requestId) => { ids.push(requestId); return ids.length === 1 ? first.promise : second.promise; };
    const old = store.getState().selectCommit('same-commit');
    await store.getState().selectLocal();
    const latest = store.getState().selectCommit('same-commit');
    const file = { ...store.getState().snapshot!.unstaged[0], area: 'commit' as const };
    second.resolve({ sessionId: 'demo-session', requestId: ids[1], oid: 'same-commit', files: [{ ...file, id: 'latest-file' }] });
    await latest;
    first.resolve({ sessionId: 'demo-session', requestId: ids[0], oid: 'same-commit', files: [{ ...file, id: 'old-file' }] });
    await old;
    expect(store.getState().commitFiles[0].id).toBe('latest-file');
  });

  it('starts only one write when two clicks arrive in the same event turn', async () => {
    const { store, adapter } = await setup();
    const operations = vi.spyOn(adapter, 'applyOperation');
    const ids = [store.getState().snapshot!.unstaged[0].id];
    await Promise.all([store.getState().runOperation('stage', ids), store.getState().runOperation('stage', ids)]);
    expect(operations).toHaveBeenCalledTimes(1);
  });

  it('keeps staged and unstaged previews separate for an identical path', async () => {
    const { store, adapter } = await setup();
    const previews = vi.spyOn(adapter, 'getFilePreview');
    const snapshot = store.getState().snapshot!;
    expect(snapshot.staged[0].pathDisplay).toBe(snapshot.unstaged[0].pathDisplay);
    await store.getState().selectFile(snapshot.staged[0]);
    await store.getState().selectFile(snapshot.unstaged[0]);
    expect(previews.mock.calls.map((call) => call[2])).toEqual([snapshot.staged[0].id, snapshot.unstaged[0].id]);
  });

  it('opens multiple tabs and preserves their independent states when switching', async () => {
    const { store } = await setup();
    await store.getState().openRepository('/demo/project-a');
    await store.getState().openRepository('/demo/project-b');

    expect(store.getState().tabs.length).toBeGreaterThanOrEqual(2);
    expect(store.getState().activeTabId).toBe('/demo/project-b');

    store.getState().setCommitMessage('Draft for Project B');
    await store.getState().switchTab('/demo/project-a');
    expect(store.getState().activeTabId).toBe('/demo/project-a');

    store.getState().setCommitMessage('Draft for Project A');
    await store.getState().switchTab('/demo/project-b');
    expect(store.getState().commitMessage).toBe('Draft for Project B');

    await store.getState().switchTab('/demo/project-a');
    expect(store.getState().commitMessage).toBe('Draft for Project A');
  });

  it('closes active tab and switches to remaining tab, and closing all switches to home', async () => {
    const { store } = await setup();
    await store.getState().openRepository('/demo/repo-1');
    await store.getState().openRepository('/demo/repo-2');

    expect(store.getState().activeTabId).toBe('/demo/repo-2');
    await store.getState().closeTab('/demo/repo-2');
    expect(store.getState().activeTabId).toBe('/demo/repo-1');

    await store.getState().closeTab('/demo/repo-1');
    // If there were other tabs from setup, close them to reach home
    const remaining = [...store.getState().tabs];
    for (const t of remaining) {
      await store.getState().closeTab(t.id);
    }
    expect(store.getState().activeTabId).toBe('home');
    expect(store.getState().session).toBeNull();
  });

  it('focuses existing tab instead of duplicating when opening the same repository', async () => {
    const { store } = await setup();
    await store.getState().openRepository('/demo/unique-repo');
    const initialCount = store.getState().tabs.length;

    await store.getState().openRepository('/demo/other');
    expect(store.getState().activeTabId).toBe('/demo/other');

    await store.getState().openRepository('/demo/unique-repo');
    expect(store.getState().activeTabId).toBe('/demo/unique-repo');
    expect(store.getState().tabs.length).toBe(initialCount + 1);
  });

  it('manages recent repositories and persistence', async () => {
    const { store } = await setup();
    await store.getState().openRepository('/demo/recent-test');
    expect(store.getState().recentRepos.some((r) => r.path === '/demo/recent-test')).toBe(true);

    store.getState().removeRecentRepo('/demo/recent-test');
    expect(store.getState().recentRepos.some((r) => r.path === '/demo/recent-test')).toBe(false);

    store.getState().clearRecentRepos();
    expect(store.getState().recentRepos).toEqual([]);
  });

  it('reorders tabs on drag and drop', async () => {
    const { store } = await setup();
    await store.getState().openRepository('/demo/tab-first');
    await store.getState().openRepository('/demo/tab-second');
    const tabs = store.getState().tabs;
    const idxFirst = tabs.findIndex((t) => t.id === '/demo/tab-first');
    const idxSecond = tabs.findIndex((t) => t.id === '/demo/tab-second');

    store.getState().reorderTabs(idxFirst, idxSecond);
    const reordered = store.getState().tabs;
    const newIdxFirst = reordered.findIndex((t) => t.id === '/demo/tab-first');
    const newIdxSecond = reordered.findIndex((t) => t.id === '/demo/tab-second');
    expect(newIdxFirst).toBe(idxSecond);
    expect(newIdxSecond).toBe(idxSecond - 1);
  });

  it('sets and clears tab color tags', async () => {
    const { store } = await setup();
    await store.getState().openRepository('/demo/color-repo');
    store.getState().setTabColor('/demo/color-repo', '#3b82f6');
    expect(store.getState().tabs.find((t) => t.id === '/demo/color-repo')?.color).toBe('#3b82f6');

    store.getState().setTabColor('/demo/color-repo', null);
    expect(store.getState().tabs.find((t) => t.id === '/demo/color-repo')?.color).toBeNull();
  });

  it('closes other tabs and tabs to the right', async () => {
    const { store } = await setup();
    await store.getState().openRepository('/demo/a');
    await store.getState().openRepository('/demo/b');
    await store.getState().openRepository('/demo/c');

    await store.getState().closeTabsToRight('/demo/b');
    expect(store.getState().tabs.some((t) => t.id === '/demo/c')).toBe(false);
    expect(store.getState().tabs.some((t) => t.id === '/demo/b')).toBe(true);

    await store.getState().closeOtherTabs('/demo/b');
    expect(store.getState().tabs.length).toBe(1);
    expect(store.getState().tabs[0].id).toBe('/demo/b');
  });

  it('opens multiple repositories at once and assigns default group colors', async () => {
    const { store } = await setup();
    await store.getState().openRepositories(['/demo/multi-1', '/demo/multi-2', '/demo/multi-3']);

    const tabs = store.getState().tabs;
    expect(tabs.length).toBe(4);
    expect(tabs[1].id).toBe('/demo/multi-1');
    expect(tabs[2].id).toBe('/demo/multi-2');
    expect(tabs[3].id).toBe('/demo/multi-3');

    // Every tab has a non-null default color assigned
    expect(tabs[0].color).toBeTruthy();
    expect(tabs[1].color).toBeTruthy();
    expect(tabs[2].color).toBeTruthy();
    expect(tabs[3].color).toBeTruthy();
  });

  it('applies commitAmend and clears commitMessage on success', async () => {
    const { store, adapter } = await setup();
    const write = vi.spyOn(adapter, 'applyOperation');
    const sessionId = store.getState().session!.sessionId;
    store.getState().setCommitMessage('Updated commit message');

    await store.getState().runOperation('commitAmend');
    expect(write).toHaveBeenCalledWith(sessionId, expect.any(Number), 'commitAmend', [], 'Updated commit message');
    expect(store.getState().commitMessage).toBe('');
  });

  it('applies forcePushWithLease', async () => {
    const { store, adapter } = await setup();
    const write = vi.spyOn(adapter, 'applyOperation');
    const sessionId = store.getState().session!.sessionId;

    await store.getState().runOperation('forcePushWithLease');
    expect(write).toHaveBeenCalledWith(sessionId, expect.any(Number), 'forcePushWithLease', [], '');
  });

  it('does not rescan the repository after external open actions', async () => {
    const { store, adapter } = await setup();
    const snapshot = vi.spyOn(adapter, 'getSnapshot');
    adapter.applyOperation = async (sessionId, requestId) => ({ sessionId, requestId, message: 'Opened' });

    for (const operation of ['openTerminal', 'openEditor', 'revealFile', 'openBrowser'] as const) {
      await store.getState().runOperation(operation, [], 'target');
    }

    expect(snapshot).not.toHaveBeenCalled();
  });

  it('executes stash operations without file ids', async () => {
    const { store, adapter } = await setup();
    const write = vi.spyOn(adapter, 'applyOperation');
    const sessionId = store.getState().session!.sessionId;

    await store.getState().runOperation('stashPush', [], 'custom stash');
    expect(write).toHaveBeenCalledWith(sessionId, expect.any(Number), 'stashPush', [], 'custom stash');

    await store.getState().runOperation('stashPop');
    expect(write).toHaveBeenCalledWith(sessionId, expect.any(Number), 'stashPop', [], '');

    await store.getState().runOperation('stashApply');
    expect(write).toHaveBeenCalledWith(sessionId, expect.any(Number), 'stashApply', [], '');

    await store.getState().runOperation('stashDrop');
    expect(write).toHaveBeenCalledWith(sessionId, expect.any(Number), 'stashDrop', [], '');
  });

  it('executes cherryPick and deleteRemoteBranch operations', async () => {
    const { store, adapter } = await setup();
    const write = vi.spyOn(adapter, 'applyOperation');
    const sessionId = store.getState().session!.sessionId;

    await store.getState().runOperation('cherryPick', [], 'abcdef123');
    expect(write).toHaveBeenCalledWith(sessionId, expect.any(Number), 'cherryPick', [], 'abcdef123');

    await store.getState().runOperation('deleteRemoteBranch', [], 'origin/feat-1');
    expect(write).toHaveBeenCalledWith(sessionId, expect.any(Number), 'deleteRemoteBranch', [], 'origin/feat-1');
  });

  it('executes reset operation', async () => {
    const { store, adapter } = await setup();
    const write = vi.spyOn(adapter, 'applyOperation');
    const sessionId = store.getState().session!.sessionId;

    await store.getState().runOperation('reset', [], JSON.stringify({ commitOid: 'abcdef123', mode: 'mixed' }));
    expect(write).toHaveBeenCalledWith(
      sessionId,
      expect.any(Number),
      'reset',
      [],
      JSON.stringify({ commitOid: 'abcdef123', mode: 'mixed' }),
    );
  });

  it('does not reload or reset preview when selecting already selected file', async () => {
    const { store, adapter } = await setup();
    const target = store.getState().snapshot!.unstaged[0];
    await store.getState().selectFile(target);
    const initialPreview = store.getState().preview;
    expect(initialPreview).toBeTruthy();

    const previewSpy = vi.spyOn(adapter, 'getFilePreview');
    await store.getState().selectFile(target);
    expect(previewSpy).not.toHaveBeenCalled();
    expect(store.getState().preview).toBe(initialPreview);
  });

  it('allows renaming tab with setTabName and persists to localStorage', async () => {
    const { store } = await setup();
    const tab = store.getState().tabs[0];
    expect(tab).toBeDefined();

    store.getState().setTabName(tab.id, 'Novo Nome');
    expect(store.getState().tabs[0].name).toBe('Novo Nome');
    const saved = JSON.parse(localStorage.getItem('Gitma:tab-custom-names') || '{}');
    expect(saved[tab.path]).toBe('Novo Nome');

    store.getState().setTabName(tab.id, '   ');
    expect(store.getState().tabs[0].name).toBe('demo');
    const savedAfter = JSON.parse(localStorage.getItem('Gitma:tab-custom-names') || '{}');
    expect(savedAfter[tab.path]).toBeUndefined();
  });

  it('reorderTabsList updates tabs order and saves to localStorage', async () => {
    const { store } = await setup();
    await store.getState().openRepository('/demo-2');
    expect(store.getState().tabs.length).toBe(2);

    const reversed = [...store.getState().tabs].reverse();
    store.getState().reorderTabsList(reversed);
    expect(store.getState().tabs[0].path).toBe('/demo-2');
    expect(store.getState().tabs[1].path).toBe('/demo');
  });

  it('manages settings modal open/close/toggle state', async () => {
    const { store } = await setup();
    expect(store.getState().settingsOpen).toBe(false);

    store.getState().openSettings();
    expect(store.getState().settingsOpen).toBe(true);

    store.getState().closeSettings();
    expect(store.getState().settingsOpen).toBe(false);

    store.getState().toggleSettings();
    expect(store.getState().settingsOpen).toBe(true);

    store.getState().toggleSettings();
    expect(store.getState().settingsOpen).toBe(false);
  });

  it('cloneRepository invokes bridge and opens cloned repo tab', async () => {
    const { store, adapter } = await setup();
    const cloneSpy = vi.spyOn(adapter, 'cloneRepository');

    await store.getState().cloneRepository('https://github.com/example/repo.git', '/target/repo');
    expect(cloneSpy).toHaveBeenCalledWith('https://github.com/example/repo.git', '/target/repo');
    expect(store.getState().tabs.some((t) => t.path === '/target/repo')).toBe(true);
  });

  it('initRepository invokes bridge and opens newly initialized repo tab', async () => {
    const { store, adapter } = await setup();
    const initSpy = vi.spyOn(adapter, 'initRepository');

    await store.getState().initRepository('/new/my-project', 'main');
    expect(initSpy).toHaveBeenCalledWith('/new/my-project', 'main');
    expect(store.getState().tabs.some((t) => t.path === '/new/my-project')).toBe(true);
  });
});


describe('history pagination coordination', () => {
  it('keeps a pending page when commit selection changes and deduplicates requests', async () => {
    const { store, adapter } = await setup();
    const history = { ...store.getState().history!, hasMore: true };
    store.setState({ history });
    const pending = deferred<typeof history>();
    const getHistory = vi.spyOn(adapter, 'getHistory').mockImplementation((_session, requestId, page) =>
      pending.promise.then(() => ({ ...history, requestId, page, hasMore: false })));
    const loading = store.getState().loadMore();
    await store.getState().selectCommit(history.rows[0].commit.oid);
    await store.getState().loadMore();
    expect(getHistory).toHaveBeenCalledTimes(1);
    pending.resolve(history);
    await loading;
    expect(store.getState().history?.page).toBe(1);
    expect(store.getState().history?.rows).toHaveLength(history.rows.length * 2);
  });

  it('ignores out-of-order scope responses, including a rapid round trip', async () => {
    const { store, adapter } = await setup();
    const history = store.getState().history!;
    const requests: Array<{ resolve: (value: typeof history) => void; promise: Promise<typeof history> }> = [];
    vi.spyOn(adapter, 'getHistory').mockImplementation((_session, requestId) => {
      const request = deferred<typeof history>();
      requests.push(request);
      return request.promise.then((value) => ({ ...value, requestId }));
    });
    const first = store.getState().setHistoryScope('current');
    const second = store.getState().setHistoryScope('all');
    const third = store.getState().setHistoryScope('current');
    requests[2].resolve({ ...history, rows: history.rows.slice(0, 1) });
    await third;
    requests[0].resolve(history);
    requests[1].resolve(history);
    await Promise.all([first, second]);
    expect(store.getState().historyScope).toBe('current');
    expect(store.getState().history?.rows).toHaveLength(1);
  });

  it('invalidates cached histories in other tabs when the global scope changes', async () => {
    const { store, adapter } = await setup();
    await store.getState().openRepository('/other');
    await store.getState().setHistoryScope('current');
    const inactive = store.getState().tabs.find((tab) => tab.id !== store.getState().activeTabId)!;
    expect(inactive.history).toBeNull();
    const getHistory = vi.spyOn(adapter, 'getHistory');
    await store.getState().switchTab(inactive.id);
    await vi.waitFor(() => expect(getHistory).toHaveBeenCalledWith(inactive.session.sessionId, expect.any(Number), 0, false));
  });

  it('discards a pending page after replacing the first page', async () => {
    const { store, adapter } = await setup();
    const history = { ...store.getState().history!, hasMore: true };
    store.setState({ history });
    const pending = deferred<typeof history>();
    vi.spyOn(adapter, 'getHistory').mockImplementation((_session, requestId, page) =>
      pending.promise.then(() => ({ ...history, requestId, page })));
    const loading = store.getState().loadMore();
    const replacement = { ...history, rows: history.rows.slice(0, 1) };
    store.setState({ history: replacement });
    pending.resolve(history);
    await loading;
    expect(store.getState().history).toBe(replacement);
  });
});
