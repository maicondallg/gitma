import { create } from 'zustand';
import { getBridge } from '../lib/bridge';
import type { AppError, CommandLogEntry, CommitDetails, CommitFiles, Context, DiffMode, DiffStat, FileEntry, FileViewMode, History, Operation, Preview, RecentRepo, RemoteEntry, RepoAuthState, RepoChanged, Session, Snapshot, TabItem } from '../lib/types';
import { buildWebUrl } from '../lib/webUrl';

type Notice = AppError | { message: string; category: 'success' };
type RefreshReason = 'manual' | 'focus' | 'watcher' | 'mutation';

const OPEN_TABS_KEY = 'Gitma:open-tabs';
const ACTIVE_TAB_KEY = 'Gitma:active-tab';
const RECENT_REPOS_KEY = 'Gitma:recent-repos';
const TAB_COLORS_KEY = 'Gitma:tab-colors';
const TAB_GROUP_NAMES_KEY = 'Gitma:tab-group-names';
const PREFERRED_TERMINAL_KEY = 'Gitma:preferred-terminal';

export function loadSavedTerminal(): string {
  try {
    return (typeof window !== 'undefined' ? localStorage.getItem(PREFERRED_TERMINAL_KEY) : null) || 'default';
  } catch {
    return 'default';
  }
}

export function saveTerminal(terminal: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PREFERRED_TERMINAL_KEY, terminal);
  } catch {}
}

const PREFERRED_EDITOR_KEY = 'Gitma:preferred-editor-v1';

export function loadSavedEditor(): string {
  try {
    return (typeof window !== 'undefined' ? localStorage.getItem(PREFERRED_EDITOR_KEY) : null) || 'default';
  } catch {
    return 'default';
  }
}

export function saveEditor(editor: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PREFERRED_EDITOR_KEY, editor);
  } catch {}
}

export const DEFAULT_TAB_PALETTE = [
  '#3b82f6', // Azul
  '#10b981', // Verde esmeralda
  '#8b5cf6', // Roxo
  '#f59e0b', // Âmbar
  '#ef4444', // Vermelho
  '#06b6d4', // Ciano
  '#ec4899', // Rosa
  '#84cc16', // Lima
];

export function loadSavedTabColors(): Record<string, string> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(TAB_COLORS_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveTabColors(colors: Record<string, string>): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TAB_COLORS_KEY, JSON.stringify(colors));
  } catch {}
}

export function loadSavedGroupNames(): Record<string, string> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(TAB_GROUP_NAMES_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveGroupNames(names: Record<string, string>): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TAB_GROUP_NAMES_KEY, JSON.stringify(names));
  } catch {}
}

const TAB_CUSTOM_NAMES_KEY = 'Gitma:tab-custom-names';

export function loadSavedTabNames(): Record<string, string> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(TAB_CUSTOM_NAMES_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveTabNames(names: Record<string, string>): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TAB_CUSTOM_NAMES_KEY, JSON.stringify(names));
  } catch {}
}

export function loadSavedTabs(): string[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(OPEN_TABS_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOpenTabs(paths: string[], activeTabId?: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(paths));
    if (activeTabId !== undefined) {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
    }
  } catch {}
}

export function loadSavedActiveTab(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_TAB_KEY) : null;
  } catch {
    return null;
  }
}

export function loadRecentRepos(): RecentRepo[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(RECENT_REPOS_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentRepos(recents: RecentRepo[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(recents));
  } catch {}
}

export interface AppState {
  tabs: TabItem[];
  activeTabId: string;
  recentRepos: RecentRepo[];

  session: Session | null;
  snapshot: Snapshot | null;
  history: History | null;
  context: Context;
  commitFiles: FileEntry[];
  commitStats: DiffStat | null;
  commitDetails: CommitDetails | null;
  selectedFile: FileEntry | null;
  preview: Preview | null;
  diffMode: DiffMode;
  compactDiff: boolean;
  fileViewMode: FileViewMode;
  commitMessage: string;
  refreshing: boolean;
  opening: boolean;
  operation: Operation | null;
  operationsBySession?: Record<string, Operation>;
  notice: Notice | null;
  fileHistoryPath: string | null;
  reflogOpen: boolean;
  remotesModalOpen: boolean;
  remotes?: RemoteEntry[];
  authState?: RepoAuthState | null;
  loadAuthState?(forceRefresh?: boolean): Promise<void>;
  setRepoAccount?(accountId: string): Promise<void>;
  historyScope: 'all' | 'current';
  compareOids: [string, string] | null;
  blameOpen: boolean;
  setBlameOpen(open: boolean): void;
  pullStrategy: string;
  setPullStrategy(strategy: string): void;
  mergeStrategy: string;
  setMergeStrategy(strategy: string): void;
  openFileHistory(path: string): void;
  closeFileHistory(): void;
  openReflog(): void;
  closeReflog(): void;
  openRemotesModal(): void;
  closeRemotesModal(): void;
  openInBrowser?(options?: { branch?: string | null; commitOid?: string | null; filePath?: string | null }): Promise<void>;
  restoreCommitFile?(commitOid: string, path: string): Promise<void>;
  setHistoryScope(scope: 'all' | 'current'): Promise<void>;
  compareCommits(baseOid: string, targetOid: string): Promise<void>;
  resolveConflict(path: string, choice: 'ours' | 'theirs' | 'both' | 'mark_resolved', conflictIndex?: number): Promise<void>;

  openRepository(path?: string, options?: { activate?: boolean }): Promise<void>;
  openRepositories(paths?: string[]): Promise<void>;
  cloneRepository(source: string, destination: string): Promise<void>;
  initRepository(path: string, defaultBranch?: string): Promise<void>;
  settingsOpen: boolean;
  openSettings(): void;
  closeSettings(): void;
  toggleSettings(): void;
  closeTab(tabId: string): Promise<void>;
  closeOtherTabs(tabId: string): Promise<void>;
  closeTabsToRight(tabId: string): Promise<void>;
  switchTab(tabId: string): Promise<void>;
  reorderTabs(sourceIndex: number, destinationIndex: number, options?: { persist?: boolean }): void;
  reorderTabsList(tabs: TabItem[], options?: { persist?: boolean }): void;
  setTabName(tabId: string, name: string): void;
  setTabColor(tabId: string, color: string | null): void;
  groupNames: Record<string, string>;
  setGroupName(color: string, name: string | null): void;
  preferredTerminal: string;
  setPreferredTerminal(terminal: string): void;
  openTerminal(customTerminal?: string): Promise<void>;
  preferredEditor: string;
  setPreferredEditor(editor: string): void;
  openHome(): void;
  removeRecentRepo(path: string): void;
  clearRecentRepos(): void;
  restoreSavedTabs(): Promise<void>;

  refresh(reason?: RefreshReason, event?: RepoChanged): Promise<void>;
  selectLocal(): Promise<void>;
  selectCommit(oid: string): Promise<void>;
  selectFile(file: FileEntry | null, options?: { deferPreview?: boolean }): Promise<void>;
  prefetchFile(file: FileEntry): void;
  loadMore(): Promise<void>;
  runOperation(operation: Operation, fileIds?: string[], message?: string): Promise<void>;
  setCommitMessage(value: string): void;
  activePane: 'history' | 'files';
  setActivePane(pane: 'history' | 'files'): void;
  expandedDiff: boolean;
  setExpandedDiff(expanded: boolean | ((prev: boolean) => boolean)): void;
  setDiffMode(mode: DiffMode): void;
  setCompactDiff(compact: boolean): void;
  setFileViewMode(mode: FileViewMode): void;
  filesTab: 'changes' | 'explorer';
  setFilesTab(tab: 'changes' | 'explorer'): void;
  dismissNotice(): void;
  isConsoleOpen: boolean;
  toggleConsole(): void;
  setConsoleOpen(open: boolean): void;
  commandLogs: CommandLogEntry[];
  clearCommandLogs(): void;
  runGitCommand(command: string): Promise<void>;
}

const COMMIT_PREVIEW_CACHE_LIMIT = 64;
const LOCAL_PREVIEW_CACHE_LIMIT = 32;
const MAX_CONCURRENT_PREFETCHES = 4;

let nextRequestId = 0;
let selectionToken = 0;
let contextToken = 0;
let historyScopeToken = 0;
let openToken = 0;
const refreshInFlightBySession = new Set<string>();
const queuedRefreshBySession = new Map<string, { reason: RefreshReason; event?: RepoChanged }>();
const manualRefreshingSessions = new Set<string>();
const writeChainBySession = new Map<string, Promise<void>>();
const writeReservedBySession = new Set<string>();
let loadingMore: { sessionId: string; historyKey: string; page: number; token: number } | null = null;
let unlisten: (() => void) | null = null;
// Commit contents are immutable. Keep an LRU UI cache so revisiting history
// does not clear the file list or diff while the backend cache is queried.
const commitFilesCache = new Map<string, CommitFiles>();
const commitPreviewCache = new Map<string, Preview>();
const localPreviewCache = new Map<string, Preview>();
const previewPrefetches = new Map<string, Promise<Preview>>();
const localPreviewEpoch = new Map<string, number>();
const commitKey = (sessionId: string, oid: string) => `${sessionId}\0${oid}`;
const previewKey = (sessionId: string, oid: string, fileId: string) => `${commitKey(sessionId, oid)}\0${fileId}`;
const localKey = (sessionId: string, fileId: string) => `${sessionId}\0local\0${localPreviewEpoch.get(sessionId) ?? 0}\0${fileId}`;
const filePreviewKey = (sessionId: string, context: Context, fileId: string) =>
  context.kind === 'local' ? localKey(sessionId, fileId)
    : context.kind === 'commit' ? previewKey(sessionId, context.oid, fileId)
    : `${sessionId}\0compare\0${context.baseOid}\0${context.targetOid}\0${fileId}`;
function invalidateLocalPreviews(sessionId: string) {
  localPreviewEpoch.set(sessionId, (localPreviewEpoch.get(sessionId) ?? 0) + 1);
}
function evictSessionCaches(sessionId: string) {
  const prefix = `${sessionId}\0`;
  for (const key of commitFilesCache.keys()) {
    if (key.startsWith(prefix)) commitFilesCache.delete(key);
  }
  for (const key of commitPreviewCache.keys()) {
    if (key.startsWith(prefix)) commitPreviewCache.delete(key);
  }
  for (const key of localPreviewCache.keys()) {
    if (key.startsWith(prefix)) localPreviewCache.delete(key);
  }
  for (const key of previewPrefetches.keys()) {
    if (key.startsWith(prefix)) previewPrefetches.delete(key);
  }
  localPreviewEpoch.delete(sessionId);
  queuedRefreshBySession.delete(sessionId);
  manualRefreshingSessions.delete(sessionId);
}
function remember<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value!);
}
function sameAuthState(a: RepoAuthState | null | undefined, b: RepoAuthState | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.selectedId !== b.selectedId ||
    a.resolvedId !== b.resolvedId ||
    a.resolvedLabel !== b.resolvedLabel ||
    a.resolutionReason !== b.resolutionReason ||
    a.accounts.length !== b.accounts.length
  ) {
    return false;
  }
  for (let i = 0; i < a.accounts.length; i++) {
    const left = a.accounts[i];
    const right = b.accounts[i];
    if (
      left.id !== right.id ||
      left.label !== right.label ||
      left.kind !== right.kind ||
      left.username !== right.username ||
      left.sshKeyPath !== right.sshKeyPath ||
      left.sshKeyName !== right.sshKeyName ||
      left.isGhActive !== right.isGhActive
    ) {
      return false;
    }
  }
  return true;
}

const asError = (error: unknown): AppError => {
  if (typeof error === 'object' && error && 'message' in error) return error as AppError;
  return { category: 'unknown', message: String(error) };
};
const sameFile = (a: FileEntry | null, b: FileEntry | null) => a?.id === b?.id && a?.area === b?.area;
const localFiles = (snapshot: Snapshot) => [...snapshot.staged, ...snapshot.unstaged];
const priority: Record<RefreshReason, number> = { watcher: 0, focus: 1, manual: 2, mutation: 3 };
const NO_FILE_OPERATIONS = new Set<Operation>([
  'stageAll', 'unstageAll', 'discardAll', 'push', 'forcePushWithLease', 'fetch', 'pull',
  'switchBranch', 'createBranch', 'mergeBranch', 'mergeSquash', 'mergeAbort',
  'deleteBranch', 'deleteRemoteBranch',
  'cherryPick', 'cherryPickAbort', 'cherryPickContinue',
  'stashPush', 'stashPop', 'stashApply', 'stashDrop', 'commit', 'commitAmend',
  'reset', 'revertCommit', 'createTag', 'deleteTag', 'pushTag',
  'rebase', 'rebaseContinue', 'rebaseAbort', 'rebaseSkip',
  'stageHunk', 'unstageHunk', 'discardHunk', 'ignorePath', 'openTerminal', 'openEditor', 'revealFile',
  'openBrowser', 'restoreCommitFile', 'resolveConflict', 'gitCommand'
]);
const NO_REFRESH_OPERATIONS = new Set<Operation>(['openTerminal', 'openEditor', 'revealFile', 'openBrowser']);
const MAX_COMMAND_LOGS = 10;
function mergeRefresh(
  current: { reason: RefreshReason; event?: RepoChanged } | null,
  next: { reason: RefreshReason; event?: RepoChanged }
) {
  if (!current) return next;
  const reason = priority[next.reason] >= priority[current.reason] ? next.reason : current.reason;
  const scopes = [current.event?.scope, next.event?.scope];
  const scope: RepoChanged['scope'] = scopes.includes('all') ? 'all' : scopes.includes('history') ? 'history' : 'worktree';
  const paths = [...new Set([...(current.event?.paths ?? []), ...(next.event?.paths ?? [])])];
  const event = current.event || next.event ? { sessionId: next.event?.sessionId ?? current.event!.sessionId, scope, paths } : undefined;
  return { reason, event };
}

function formatGitLogCommand(operation: Operation, ids: string[], messageToSend: string): string {
  if (operation === 'gitCommand') {
    return messageToSend.startsWith('git ') ? messageToSend : `git ${messageToSend}`;
  }
  switch (operation) {
    case 'pull':
      return messageToSend ? `git pull --${messageToSend}` : 'git pull';
    case 'push':
      return 'git push';
    case 'forcePushWithLease':
      return 'git push --force-with-lease';
    case 'fetch':
      return 'git fetch';
    case 'fetchPrune':
      return messageToSend ? `git fetch --prune ${messageToSend}` : 'git fetch --prune';
    case 'commit':
      return `git commit -m "${messageToSend.replace(/"/g, '\\"')}"`;
    case 'commitAmend':
      return messageToSend ? `git commit --amend -m "${messageToSend.replace(/"/g, '\\"')}"` : 'git commit --amend';
    case 'stage':
      return ids.length === 1 ? 'git add <file>' : `git add (${ids.length} files)`;
    case 'stageAll':
      return 'git add -A';
    case 'unstage':
      return ids.length === 1 ? 'git restore --staged <file>' : `git restore --staged (${ids.length} files)`;
    case 'unstageAll':
      return 'git restore --staged .';
    case 'discard':
      return ids.length === 1 ? 'git checkout -- <file>' : `git checkout -- (${ids.length} files)`;
    case 'discardAll':
      return 'git checkout -- .';
    case 'stashPush': {
      try {
        const parsed = JSON.parse(messageToSend);
        const parts = ['git stash push'];
        if (parsed.include_untracked) parts.push('-u');
        if (parsed.message) parts.push(`-m "${parsed.message.replace(/"/g, '\\"')}"`);
        return parts.join(' ');
      } catch {
        return messageToSend ? `git stash push -m "${messageToSend.replace(/"/g, '\\"')}"` : 'git stash';
      }
    }
    case 'stashPop':
      return 'git stash pop';
    case 'stashApply':
      return 'git stash apply';
    case 'stashDrop':
      return 'git stash drop';
    case 'switchBranch':
      return `git switch ${messageToSend}`;
    case 'createBranch': {
      try {
        const parsed = JSON.parse(messageToSend);
        return `git checkout -b ${parsed.name || messageToSend}`;
      } catch {
        return `git checkout -b ${messageToSend}`;
      }
    }
    case 'mergeBranch':
      return `git merge ${messageToSend}`;
    case 'mergeAbort':
      return 'git merge --abort';
    case 'rebaseAbort':
      return 'git rebase --abort';
    case 'rebaseContinue':
      return 'git rebase --continue';
    case 'rebaseSkip':
      return 'git rebase --skip';
    case 'resolveConflict': {
      try {
        const parsed = JSON.parse(messageToSend);
        const p = parsed.path || '<file>';
        const idx = typeof parsed.conflictIndex === 'number' ? ` (bloco #${parsed.conflictIndex + 1})` : '';
        if (parsed.choice === 'ours') return `git checkout --ours -- ${p}${idx}`;
        if (parsed.choice === 'theirs') return `git checkout --theirs -- ${p}${idx}`;
        if (parsed.choice === 'both') return `git add -- ${p} (ambos${idx})`;
        return `git add -- ${p}`;
      } catch {
        return `git resolveConflict ${messageToSend}`;
      }
    }
    default:
      return `git ${operation}${ids.length ? ` (${ids.length})` : ''}${messageToSend ? ` ${messageToSend}` : ''}`;
  }
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
function notify(notice: Notice | null, set: (fn: (s: AppState) => Partial<AppState>) => void) {
  if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
  set(() => ({ notice }));
  if (notice?.category === 'success') {
    noticeTimer = setTimeout(() => {
      set(() => ({ notice: null }));
      noticeTimer = null;
    }, 4000);
  }
}

export const useAppStore = create<AppState>((set, get) => {
  function syncActiveTab(current: AppState): TabItem[] {
    if (current.activeTabId === 'home') return current.tabs;
    return current.tabs.map((t) =>
      t.id === current.activeTabId
        ? {
            ...t,
            snapshot: current.snapshot,
            history: current.history,
            context: current.context,
            commitFiles: current.commitFiles,
            commitStats: current.commitStats,
            commitDetails: current.commitDetails,
            selectedFile: current.selectedFile,
            preview: current.preview,
            commitMessage: current.commitMessage,
            remotes: current.remotes,
            authState: current.authState,
            filesTab: current.filesTab,
            commandLogs: current.commandLogs,
          }
        : t
    );
  }

  function omitSessions(
    map: Record<string, Operation> | undefined,
    sessionIds: string[]
  ): Record<string, Operation> {
    const next = { ...(map ?? {}) };
    for (const id of sessionIds) {
      delete next[id];
    }
    return next;
  }

  function setSessionOperation(sessionId: string, op: Operation | null) {
    set((s) => {
      const prev = s.operationsBySession ?? {};
      const isActive = s.session?.sessionId === sessionId;
      if ((op === null && !(sessionId in prev)) || (op !== null && prev[sessionId] === op)) {
        if (isActive && s.operation !== op) {
          return { operation: op };
        }
        return {};
      }
      const next = { ...prev };
      if (op) {
        next[sessionId] = op;
      } else {
        delete next[sessionId];
      }
      return {
        operationsBySession: next,
        ...(isActive ? { operation: op } : {}),
      };
    });
  }

  function setSessionManualRefreshing(sessionId: string, value: boolean) {
    if (value) {
      manualRefreshingSessions.add(sessionId);
    } else {
      manualRefreshingSessions.delete(sessionId);
    }
    const current = get();
    if (current.session?.sessionId === sessionId && current.refreshing !== value) {
      set({ refreshing: value });
    }
  }

  function appendCommandLog(sessionId: string, entry: CommandLogEntry) {
    set((s) => {
      const isActive = s.session?.sessionId === sessionId;
      const nextTabs = s.tabs.map((t) => {
        if (t.session.sessionId !== sessionId) return t;
        const baseLogs = isActive ? s.commandLogs : (t.commandLogs ?? []);
        return {
          ...t,
          commandLogs: [...baseLogs.slice(-(MAX_COMMAND_LOGS - 1)), entry],
        };
      });
      if (isActive) {
        return {
          commandLogs: [...s.commandLogs.slice(-(MAX_COMMAND_LOGS - 1)), entry],
          tabs: nextTabs,
        };
      }
      return { tabs: nextTabs };
    });
  }

  async function previewFile(file: FileEntry | null, requestId: number) {
    const token = ++selectionToken;
    const context = contextToken;
    const state = get();
    if (!file || !state.session) {
      set({ preview: null });
      return;
    }
    try {
      const key = filePreviewKey(state.session.sessionId, state.context, file.id);
      const prefetched = previewPrefetches.get(key);
      const preview = await (prefetched
        ? prefetched.catch(() => getBridge().getFilePreview(state.session!.sessionId, requestId, file.id))
        : getBridge().getFilePreview(state.session.sessionId, requestId, file.id));
      const current = get();
      if (token === selectionToken && context === contextToken && current.session?.sessionId === state.session.sessionId && sameFile(current.selectedFile, file) && preview.fileId === file.id) {
        if (state.context.kind === 'commit') {
          remember(commitPreviewCache, previewKey(state.session.sessionId, state.context.oid, file.id), preview, COMMIT_PREVIEW_CACHE_LIMIT);
        } else if (state.context.kind === 'local' && key === localKey(state.session.sessionId, file.id)) {
          remember(localPreviewCache, key, preview, LOCAL_PREVIEW_CACHE_LIMIT);
        }
        if (current.preview?.version !== preview.version) {
          set({ preview });
        }
      }
    } catch (error) {
      const current = get();
      if (token === selectionToken && context === contextToken && current.session?.sessionId === state.session.sessionId && sameFile(current.selectedFile, file)) {
        set({ notice: asError(error) });
      }
    }
  }

  async function doRefresh(sessionId: string, reason: RefreshReason, event?: RepoChanged) {
    const before = get();
    const isBeforeActive = before.session?.sessionId === sessionId;
    const beforeTab = before.tabs.find((t) => t.session.sessionId === sessionId);
    if (!isBeforeActive && !beforeTab) return;

    const beforeHistory = isBeforeActive ? before.history : (beforeTab?.history ?? null);
    const requestId = ++nextRequestId;
    const initialScopeToken = historyScopeToken;
    const initialAllBranches = before.historyScope !== 'current';
    const pendingInitialHistory = !beforeHistory
      ? getBridge().getHistory(sessionId, requestId, 0, initialAllBranches)
      : null;
    pendingInitialHistory?.catch(() => undefined);
    const showRefreshing = reason === 'manual';
    if (showRefreshing) {
      setSessionManualRefreshing(sessionId, true);
    }
    try {
      const snapshot = await getBridge().getSnapshot(sessionId, requestId);
      const current = get();
      const isActiveNow = current.session?.sessionId === sessionId;
      const currentTab = current.tabs.find((t) => t.session.sessionId === sessionId);
      if ((!isActiveNow && !currentTab) || snapshot.requestId !== requestId) return;

      const currentSnapshot = isActiveNow ? current.snapshot : currentTab!.snapshot;
      const currentContext = isActiveNow ? current.context : currentTab!.context;
      const currentCommitFiles = isActiveNow ? current.commitFiles : currentTab!.commitFiles;
      const currentSelectedFile = isActiveNow ? current.selectedFile : currentTab!.selectedFile;
      const currentHistory = isActiveNow ? current.history : currentTab!.history;

      const branchChanged = currentSnapshot?.branch !== snapshot.branch;
      const historyChanged = currentSnapshot?.historyKey !== snapshot.historyKey || branchChanged;
      const isRepoSelected = currentSelectedFile?.area === 'repo';
      const files = currentContext.kind === 'local' ? localFiles(snapshot) : currentCommitFiles;
      const selectedFile = isRepoSelected
        ? currentSelectedFile
        : (currentSelectedFile && files.find((f) => sameFile(f, currentSelectedFile))) || null;
      const selectionLost = !isRepoSelected && currentContext.kind === 'local' && !!currentSelectedFile && !selectedFile;
      const snapshotChanged = currentSnapshot?.revision !== snapshot.revision;
      if (snapshotChanged) invalidateLocalPreviews(sessionId);
      if (snapshotChanged || currentSnapshot?.historyKey !== snapshot.historyKey || !sameFile(currentSelectedFile, selectedFile)) {
        const update = selectionLost ? { snapshot, selectedFile, preview: null } : { snapshot, selectedFile };
        if (isActiveNow) {
          set((s) =>
            branchChanged
              ? { ...update, tabs: s.tabs.map((t) => (t.session.sessionId === sessionId ? { ...t, ...update } : t)) }
              : update
          );
        } else {
          set((s) => ({
            tabs: s.tabs.map((t) => (t.session.sessionId === sessionId ? { ...t, ...update } : t)),
          }));
        }
      }
      if (isActiveNow) {
        const selectedPath = currentSelectedFile?.pathDisplay;
        const changedSelectedPath = !!selectedPath && !!event?.paths.some((path) => path === selectedPath || selectedPath.startsWith(`${path}/`) || path.startsWith(`${selectedPath}/`));
        const shouldPreview = reason === 'manual' || reason === 'mutation' || (reason === 'focus' ? snapshotChanged : (!event || event.scope !== 'worktree' || changedSelectedPath));
        if (currentContext.kind === 'local' && shouldPreview) void previewFile(selectedFile, requestId);
      }
      if (historyChanged || !currentHistory) {
        const scopeToken = historyScopeToken;
        const allBranches = get().historyScope !== 'current';
        const history = pendingInitialHistory && scopeToken === initialScopeToken && allBranches === initialAllBranches
          ? await pendingInitialHistory
          : await getBridge().getHistory(sessionId, requestId, 0, allBranches);
        if (scopeToken === historyScopeToken && history.requestId === requestId) {
          const latest = get();
          if (latest.session?.sessionId === sessionId && latest.snapshot?.historyKey === snapshot.historyKey) {
            set({ history });
          } else {
            const latestTab = latest.tabs.find((t) => t.session.sessionId === sessionId);
            if (latestTab && latestTab.snapshot?.historyKey === snapshot.historyKey) {
              set((s) => ({
                tabs: s.tabs.map((t) => (t.session.sessionId === sessionId ? { ...t, history } : t)),
              }));
            }
          }
        }
      }
      if (isActiveNow && get().session?.sessionId === sessionId && (reason === 'manual' || reason === 'mutation' || !get().authState) && getBridge().getAuthState) {
        void get().loadAuthState?.(false);
      }
    } catch (error) {
      if (get().session?.sessionId === sessionId) set({ notice: asError(error) });
    } finally {
      if (showRefreshing) {
        setSessionManualRefreshing(sessionId, false);
      }
    }
  }

  async function refreshSession(sessionId: string, reason: RefreshReason = 'manual', event?: RepoChanged) {
    if (refreshInFlightBySession.has(sessionId)) {
      queuedRefreshBySession.set(
        sessionId,
        mergeRefresh(queuedRefreshBySession.get(sessionId) ?? null, { reason, event })
      );
      return;
    }
    refreshInFlightBySession.add(sessionId);
    try {
      await doRefresh(sessionId, reason, event);
    } finally {
      refreshInFlightBySession.delete(sessionId);
      const queued = queuedRefreshBySession.get(sessionId);
      queuedRefreshBySession.delete(sessionId);
      if (queued) {
        const latest = get();
        const stillOpen =
          latest.session?.sessionId === sessionId ||
          latest.tabs.some((t) => t.session.sessionId === sessionId);
        if (stillOpen) {
          void refreshSession(sessionId, queued.reason, queued.event);
        }
      }
    }
  }

  async function mountSession(session: Session, selectedPath: string, token: number, options?: { activate?: boolean }) {
    if (token !== openToken) {
      void getBridge().closeRepository(session.sessionId);
      return;
    }

    const current = get();
    // Preserva o estado da aba anterior se houver
    const currentTabs = syncActiveTab(current);

    const savedColors = loadSavedTabColors();
    let tabColor = savedColors[session.root] ?? savedColors[selectedPath];
    if (!tabColor) {
      const colorIndex = currentTabs.length % DEFAULT_TAB_PALETTE.length;
      tabColor = DEFAULT_TAB_PALETTE[colorIndex];
      savedColors[session.root] = tabColor;
      savedColors[selectedPath] = tabColor;
      saveTabColors(savedColors);
    }

    const savedCustomNames = loadSavedTabNames();
    const tabName = savedCustomNames[session.root] ?? savedCustomNames[selectedPath] ?? session.name;

    const newTab: TabItem = {
      id: session.root,
      path: session.root,
      name: tabName,
      session,
      snapshot: null,
      history: null,
      context: { kind: 'local' },
      commitFiles: [],
      commitStats: null,
      commitDetails: null,
      selectedFile: null,
      preview: null,
      commitMessage: '',
      color: tabColor,
      remotes: [],
      authState: null,
      filesTab: 'changes',
      commandLogs: [],
    };

    const newTabs = [...currentTabs, newTab];
    const updatedRecents = [
      { path: session.root, name: session.name, lastOpened: Date.now() },
      ...current.recentRepos.filter((r) => r.path !== session.root),
    ].slice(0, 20);

    if (options?.activate === false) {
      set({ tabs: newTabs, recentRepos: updatedRecents });
    } else {
      set({
        tabs: newTabs,
        activeTabId: newTab.id,
        recentRepos: updatedRecents,
        session,
        snapshot: null,
        history: null,
        context: { kind: 'local' },
        commitFiles: [],
        commitStats: null,
        selectedFile: null,
        preview: null,
        commitMessage: '',
        remotes: [],
        authState: null,
        filesTab: 'changes',
        commandLogs: [],
        operation: null,
        refreshing: false,
        notice: session.warning ?? null,
      });
    }

    saveOpenTabs(newTabs.map((t) => t.path), get().activeTabId);
    saveRecentRepos(updatedRecents);

    if (!unlisten) {
      unlisten = await getBridge().onRepoChanged((event) => {
        const state = get();
        if (event.sessionId === state.session?.sessionId) {
          void state.refresh('watcher', event);
        }
      });
    }

    if (options?.activate !== false) await refreshSession(session.sessionId, 'manual');
  }

  const pendingAuthRequests = new Map<string, Promise<void>>();

  return {
    tabs: [],
    activeTabId: 'home',
    recentRepos: loadRecentRepos(),
    groupNames: loadSavedGroupNames(),
    preferredTerminal: loadSavedTerminal(),
    preferredEditor: loadSavedEditor(),

    session: null,
    snapshot: null,
    history: null,
    context: { kind: 'local' },
    commitFiles: [],
    commitStats: null,
    commitDetails: null,
    selectedFile: null,
    preview: null,
    diffMode: 'unified',
    compactDiff: true,
    fileViewMode: 'tree',
    filesTab: 'changes',
    setFilesTab(tab) {
      set({ filesTab: tab });
    },
    commitMessage: '',
    fileHistoryPath: null,
    reflogOpen: false,
    remotesModalOpen: false,
    remotes: [],
    authState: null,
    async loadAuthState(forceRefresh = false) {
      const session = get().session;
      const bridge = getBridge();
      if (!session || !bridge.getAuthState) return;
      const key = `${session.sessionId}:${forceRefresh}`;
      const existing = pendingAuthRequests.get(key);
      if (existing) return existing;
      const request = (async () => {
        try {
          const authState = await bridge.getAuthState!(session.sessionId, forceRefresh);
          const latest = get();
          if (latest.session?.sessionId === session.sessionId && !sameAuthState(latest.authState, authState)) {
            set((s) => ({
              authState,
              tabs: s.tabs.map((t) => (t.session.sessionId === session.sessionId ? { ...t, authState } : t)),
            }));
          }
        } catch {
          // Ignore if auth state lookup fails
        }
      })().finally(() => {
        if (pendingAuthRequests.get(key) === request) {
          pendingAuthRequests.delete(key);
        }
      });
      pendingAuthRequests.set(key, request);
      return request;
    },
    async setRepoAccount(accountId: string) {
      const session = get().session;
      const bridge = getBridge();
      if (!session || !bridge.setRepoAccount) return;
      try {
        const authState = await bridge.setRepoAccount(session.sessionId, accountId);
        if (get().session?.sessionId === session.sessionId) {
          set((s) => ({
            authState,
            tabs: s.tabs.map((t) => (t.session.sessionId === session.sessionId ? { ...t, authState } : t)),
          }));
          const label =
            accountId === 'auto'
              ? `Auto (${authState.resolvedLabel || 'padrão'})`
              : accountId === 'system'
              ? 'Padrão do sistema'
              : authState.resolvedLabel || accountId;
          notify({ category: 'success', message: `Conta do repositório alterada para: ${label}` }, set);
        }
      } catch (error) {
        notify(asError(error), set);
      }
    },
    historyScope: 'all',
    compareOids: null,
    blameOpen: false,
    setBlameOpen(open) {
      set({ blameOpen: open });
    },
    pullStrategy: (() => {
      try {
        return localStorage.getItem('Gitma:pull-strategy') || 'ff-only';
      } catch {
        return 'ff-only';
      }
    })(),
    setPullStrategy(strategy) {
      try {
        localStorage.setItem('Gitma:pull-strategy', strategy);
      } catch {}
      set({ pullStrategy: strategy });
    },
    mergeStrategy: (() => {
      try {
        return localStorage.getItem('Gitma:merge-strategy') || 'default';
      } catch {
        return 'default';
      }
    })(),
    setMergeStrategy(strategy) {
      try {
        localStorage.setItem('Gitma:merge-strategy', strategy);
      } catch {}
      set({ mergeStrategy: strategy });
    },
    openFileHistory(path) {
      set({ fileHistoryPath: path });
    },
    closeFileHistory() {
      set({ fileHistoryPath: null });
    },
    openReflog() {
      set({ reflogOpen: true });
    },
    closeReflog() {
      set({ reflogOpen: false });
    },
    openRemotesModal() {
      set({ remotesModalOpen: true });
    },
    closeRemotesModal() {
      set({ remotesModalOpen: false });
    },
    isConsoleOpen: false,
    toggleConsole() {
      set((s) => ({ isConsoleOpen: !s.isConsoleOpen }));
    },
    setConsoleOpen(open) {
      set({ isConsoleOpen: open });
    },
    commandLogs: [],
    clearCommandLogs() {
      set((s) => ({
        commandLogs: [],
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, commandLogs: [] } : t)),
      }));
    },
    async runGitCommand(command) {
      const trimmed = command.trim();
      if (!trimmed) return;
      await get().runOperation('gitCommand', [], trimmed);
    },
    async openInBrowser(options) {
      const state = get();
      if (!state.session) return;

      const bridge = getBridge();
      let remotes: RemoteEntry[] = [];
      if (bridge.getRemotes) {
        try {
          const res = await bridge.getRemotes(state.session.sessionId, Date.now());
          if (res?.remotes && res.remotes.length > 0) {
            remotes = res.remotes;
            set({ remotes: res.remotes });
          }
        } catch {}
      }

      // Fallback para remotes salvos na aba ativa caso bridge falhe
      if (remotes.length === 0) {
        if (state.remotes && state.remotes.length > 0) {
          remotes = state.remotes;
        } else {
          const currentTab = state.tabs.find((t) => t.id === state.activeTabId);
          remotes = currentTab?.remotes ?? [];
        }
      }

      if (remotes.length === 0) {
        notify({ category: 'validation', message: 'Nenhum repositório remoto configurado para abrir no navegador.' }, set);
        return;
      }

      // 1. Tenta identificar o remoto pela branch tracking upstream atual (ex: "origin/main", "upstream/feat")
      let selectedRemote: RemoteEntry | undefined;
      let trackingBranch: string | undefined;

      const upstream = state.snapshot?.upstream?.trim();
      if (upstream) {
        const slashIdx = upstream.indexOf('/');
        if (slashIdx !== -1) {
          const upRemote = upstream.slice(0, slashIdx);
          const upBranch = upstream.slice(slashIdx + 1);
          const match = remotes.find((r) => r.name === upRemote);
          if (match) {
            selectedRemote = match;
            trackingBranch = upBranch;
          }
        }
      }

      // 2. Se não encontrou por upstream, prioriza 'origin'
      if (!selectedRemote) {
        selectedRemote = remotes.find((r) => r.name === 'origin');
      }

      // 3. Fallback para o primeiro remote configurado
      if (!selectedRemote) {
        selectedRemote = remotes[0];
      }

      const remoteUrl = selectedRemote.fetchUrl || selectedRemote.pushUrl;
      if (!remoteUrl) {
        notify({ category: 'validation', message: 'Nenhum repositório remoto configurado para abrir no navegador.' }, set);
        return;
      }

      const branchToOpen = (options?.branch !== undefined && options.branch !== null && options.branch.trim().length > 0)
        ? options.branch
        : (trackingBranch || state.snapshot?.branch);

      const webUrl = buildWebUrl(remoteUrl, {
        branch: branchToOpen,
        commitOid: options?.commitOid,
        filePath: options?.filePath,
        remoteName: selectedRemote.name,
      });

      if (!webUrl) {
        notify({ category: 'validation', message: 'Não foi possível identificar a URL web do repositório remoto.' }, set);
        return;
      }

      if (get().session?.sessionId !== state.session.sessionId) return;
      await get().runOperation('openBrowser', [], webUrl);
    },
    async restoreCommitFile(commitOid, path) {
      const state = get();
      if (!state.session) return;
      await state.runOperation('restoreCommitFile', [], JSON.stringify({ oid: commitOid, path }));
    },
    async setHistoryScope(scope) {
      const current = get();
      if (current.historyScope === scope) return;
      const token = ++historyScopeToken;
      set((state) => ({
        historyScope: scope,
        tabs: state.tabs.map((tab) => ({ ...tab, history: null })),
      }));
      if (current.session) {
        const requestId = ++nextRequestId;
        const allBranches = scope === 'all';
        try {
          const history = await getBridge().getHistory(current.session.sessionId, requestId, 0, allBranches);
          if (token === historyScopeToken && get().session?.sessionId === current.session.sessionId) {
            set((s) => ({
              history,
              tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, history } : t)),
            }));
          }
        } catch (error) {
          if (token === historyScopeToken && get().session?.sessionId === current.session.sessionId) set({ notice: asError(error) });
        }
      }
    },
    async resolveConflict(path, choice, conflictIndex) {
      const payload = conflictIndex !== undefined ? { path, choice, conflictIndex } : { path, choice };
      await get().runOperation('resolveConflict', [], JSON.stringify(payload));
    },
    activePane: 'history',
    setActivePane(pane) {
      set({ activePane: pane });
    },
    expandedDiff: false,
    setExpandedDiff(expanded) {
      set((s) => ({
        expandedDiff: typeof expanded === 'function' ? expanded(s.expandedDiff) : expanded,
      }));
    },
    refreshing: false,
    opening: false,
    operation: null,
    operationsBySession: {},
    notice: null,

    async openRepository(path, options) {
      const token = ++openToken;
      if (options?.activate !== false) set({ opening: true });
      try {
        const bridge = getBridge();
        let selectedPath = path;
        if (!selectedPath) {
          if (bridge.chooseFolders) {
            const picked = await bridge.chooseFolders();
            if (!picked || picked.length === 0) return;
            if (picked.length > 1) {
              await get().openRepositories(picked);
              return;
            }
            selectedPath = picked[0];
          } else if (bridge.chooseFolder) {
            selectedPath = (await bridge.chooseFolder()) ?? undefined;
          }
        }
        if (!selectedPath || token !== openToken) return;

        // Se já estiver aberto em uma aba, foca nela
        const current = get();
        const existing = current.tabs.find((t) => t.path === selectedPath || t.session.root === selectedPath);
        if (existing) {
          if (options?.activate !== false) await get().switchTab(existing.id);
          const updatedRecents = [
            { path: existing.path, name: existing.name, lastOpened: Date.now() },
            ...current.recentRepos.filter((r) => r.path !== existing.path),
          ].slice(0, 20);
          set({ recentRepos: updatedRecents });
          saveRecentRepos(updatedRecents);
          return;
        }

        const session = await bridge.openRepository(selectedPath);
        await mountSession(session, selectedPath, token, options);
      } catch (error) {
        if (token === openToken) set({ notice: asError(error) });
      } finally {
        if (token === openToken && options?.activate !== false) set({ opening: false });
      }
    },

    async cloneRepository(source, destination) {
      const bridge = getBridge();
      if (!bridge.cloneRepository) {
        set({ notice: { category: 'validation', message: 'Clonagem não suportada neste ambiente.' } });
        return;
      }
      const token = ++openToken;
      set({ opening: true });
      try {
        const session = await bridge.cloneRepository(source, destination);
        await mountSession(session, destination, token);
        notify({ category: 'success', message: 'Repositório clonado com sucesso!' }, set);
      } catch (error) {
        if (token === openToken) set({ notice: asError(error) });
        throw error;
      } finally {
        if (token === openToken) set({ opening: false });
      }
    },

    async initRepository(path, defaultBranch) {
      const bridge = getBridge();
      if (!bridge.initRepository) {
        set({ notice: { category: 'validation', message: 'Inicialização não suportada neste ambiente.' } });
        return;
      }
      const token = ++openToken;
      set({ opening: true });
      try {
        const session = await bridge.initRepository(path, defaultBranch);
        await mountSession(session, path, token);
        notify({ category: 'success', message: 'Repositório inicializado com sucesso!' }, set);
      } catch (error) {
        if (token === openToken) set({ notice: asError(error) });
        throw error;
      } finally {
        if (token === openToken) set({ opening: false });
      }
    },

    settingsOpen: false,
    openSettings() {
      set({ settingsOpen: true });
    },
    closeSettings() {
      set({ settingsOpen: false });
    },
    toggleSettings() {
      set((s) => ({ settingsOpen: !s.settingsOpen }));
    },

    async openRepositories(paths) {
      const bridge = getBridge();
      let targetPaths = paths;
      if (!targetPaths || targetPaths.length === 0) {
        if (bridge.chooseFolders) {
          targetPaths = await bridge.chooseFolders();
        } else if (bridge.chooseFolder) {
          const single = await bridge.chooseFolder();
          targetPaths = single ? [single] : [];
        }
        if (!targetPaths || targetPaths.length === 0) return;
      }

      if (targetPaths.length === 1) {
        await get().openRepository(targetPaths[0], { activate: true });
        return;
      }

      const bgPaths = targetPaths.slice(0, -1);
      const activePath = targetPaths[targetPaths.length - 1];
      const token = ++openToken;
      const bgResults = await Promise.all(
        bgPaths.map(async (p) => {
          const current = get();
          if (current.tabs.some((t) => t.path === p || t.session.root === p)) return null;
          try {
            const session = await bridge.openRepository(p);
            return { session, path: p };
          } catch (error) {
            if (token === openToken) set({ notice: asError(error) });
            return null;
          }
        })
      );
      for (const item of bgResults) {
        if (item) {
          await mountSession(item.session, item.path, token, { activate: false });
        }
      }
      await get().openRepository(activePath, { activate: true });
    },

    async closeTab(tabId) {
      const current = get();
      const tabToClose = current.tabs.find((t) => t.id === tabId);
      if (!tabToClose) return;

      const closedSessionId = tabToClose.session.sessionId;
      evictSessionCaches(closedSessionId);
      void getBridge().closeRepository(closedSessionId);

      const remainingTabs = current.tabs.filter((t) => t.id !== tabId);
      const nextOps = omitSessions(current.operationsBySession, [closedSessionId]);

      if (current.activeTabId === tabId) {
        const closedIndex = current.tabs.findIndex((t) => t.id === tabId);
        if (remainingTabs.length === 0) {
          set({
            tabs: [],
            activeTabId: 'home',
            session: null,
            snapshot: null,
            history: null,
            context: { kind: 'local' },
            commitFiles: [],
            commitStats: null,
            commitDetails: null,
            selectedFile: null,
            preview: null,
            commitMessage: '',
            remotes: [],
            authState: null,
            commandLogs: [],
            operationsBySession: nextOps,
            operation: null,
            refreshing: false,
          });
          saveOpenTabs([], 'home');
        } else {
          const nextIndex = Math.min(closedIndex, remainingTabs.length - 1);
          const nextTab = remainingTabs[nextIndex];
          const nextSessionId = nextTab.session.sessionId;
          set({
            tabs: remainingTabs,
            activeTabId: nextTab.id,
            session: nextTab.session,
            snapshot: nextTab.snapshot,
            history: nextTab.history,
            context: nextTab.context,
            commitFiles: nextTab.commitFiles,
            commitStats: nextTab.commitStats ?? null,
            commitDetails: nextTab.commitDetails ?? null,
            selectedFile: nextTab.selectedFile,
            preview: nextTab.preview,
            commitMessage: nextTab.commitMessage,
            remotes: nextTab.remotes ?? [],
            authState: nextTab.authState ?? null,
            filesTab: nextTab.filesTab ?? 'changes',
            commandLogs: nextTab.commandLogs ?? [],
            operationsBySession: nextOps,
            operation: nextOps[nextSessionId] ?? null,
            refreshing: manualRefreshingSessions.has(nextSessionId),
          });
          saveOpenTabs(remainingTabs.map((t) => t.path), nextTab.id);
          if (!nextTab.snapshot) {
            await refreshSession(nextSessionId, 'manual');
          } else {
            void refreshSession(nextSessionId, 'focus');
          }
        }
      } else {
        set({ tabs: remainingTabs, operationsBySession: nextOps });
        saveOpenTabs(remainingTabs.map((t) => t.path), current.activeTabId);
      }
    },

    reorderTabs(sourceIndex, destinationIndex, options) {
      const current = get();
      if (
        sourceIndex === destinationIndex ||
        sourceIndex < 0 ||
        destinationIndex < 0 ||
        sourceIndex >= current.tabs.length ||
        destinationIndex >= current.tabs.length
      ) return;

      const reordered = [...current.tabs];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(destinationIndex, 0, moved);
      set({ tabs: reordered });
      if (options?.persist !== false) {
        saveOpenTabs(reordered.map((t) => t.path), current.activeTabId);
      }
    },

    reorderTabsList(newTabs, options) {
      const current = get();
      set({ tabs: newTabs });
      if (options?.persist !== false) {
        saveOpenTabs(newTabs.map((t) => t.path), current.activeTabId);
      }
    },

    setTabName(tabId, name) {
      const current = get();
      const tab = current.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const defaultName = tab.path.split(/[/\\]/).filter(Boolean).pop() || 'Repositório';
      const cleanName = name.trim();
      const finalName = cleanName.length > 0 ? cleanName : defaultName;
      const updated = current.tabs.map((t) => (t.id === tabId ? { ...t, name: finalName } : t));
      set({ tabs: updated });
      const customNames = loadSavedTabNames();
      if (cleanName.length > 0 && cleanName !== defaultName) {
        customNames[tab.path] = cleanName;
      } else {
        delete customNames[tab.path];
      }
      saveTabNames(customNames);
    },

    setTabColor(tabId, color) {
      const current = get();
      const updated = current.tabs.map((t) => (t.id === tabId ? { ...t, color } : t));
      set({ tabs: updated });
      const colors = loadSavedTabColors();
      const tab = current.tabs.find((t) => t.id === tabId);
      if (tab) {
        if (color) {
          colors[tab.path] = color;
        } else {
          delete colors[tab.path];
        }
        saveTabColors(colors);
      }
    },

    setGroupName(color, name) {
      const current = get();
      const key = color.toLowerCase();
      const updated = { ...current.groupNames };
      if (name && name.trim().length > 0) {
        updated[key] = name.trim();
      } else {
        delete updated[key];
      }
      set({ groupNames: updated });
      saveGroupNames(updated);
    },

    setPreferredTerminal(terminal) {
      set({ preferredTerminal: terminal });
      saveTerminal(terminal);
    },

    async openTerminal(customTerminal) {
      const state = get();
      if (!state.session) return;
      const term = customTerminal !== undefined ? customTerminal : state.preferredTerminal;
      const termToSend = term && term !== 'default' ? term : '';
      await state.runOperation('openTerminal', [], termToSend);
    },

    setPreferredEditor(editor) {
      set({ preferredEditor: editor });
      saveEditor(editor);
    },

    async closeOtherTabs(tabId) {
      const current = get();
      const tabsToClose = current.tabs.filter((t) => t.id !== tabId);
      const closedSessionIds: string[] = [];
      for (const t of tabsToClose) {
        closedSessionIds.push(t.session.sessionId);
        evictSessionCaches(t.session.sessionId);
        void getBridge().closeRepository(t.session.sessionId);
      }
      const remaining = current.tabs.filter((t) => t.id === tabId);
      const nextOps = omitSessions(current.operationsBySession, closedSessionIds);
      set({ tabs: remaining, operationsBySession: nextOps });
      saveOpenTabs(remaining.map((t) => t.path), tabId);

      if (current.activeTabId !== tabId && remaining.length > 0) {
        await get().switchTab(tabId);
      }
    },

    async closeTabsToRight(tabId) {
      const current = get();
      const index = current.tabs.findIndex((t) => t.id === tabId);
      if (index === -1 || index >= current.tabs.length - 1) return;
      const tabsToClose = current.tabs.slice(index + 1);
      const closedSessionIds: string[] = [];
      for (const t of tabsToClose) {
        closedSessionIds.push(t.session.sessionId);
        evictSessionCaches(t.session.sessionId);
        void getBridge().closeRepository(t.session.sessionId);
      }
      const remaining = current.tabs.slice(0, index + 1);
      const wasActiveClosed = tabsToClose.some((t) => t.id === current.activeTabId);
      const nextOps = omitSessions(current.operationsBySession, closedSessionIds);
      set({ tabs: remaining, operationsBySession: nextOps });
      saveOpenTabs(remaining.map((t) => t.path), wasActiveClosed ? tabId : current.activeTabId);

      if (wasActiveClosed) {
        await get().switchTab(tabId);
      }
    },

    async switchTab(tabId) {
      const current = get();
      if (current.activeTabId === tabId) return;

      // Salva estado da aba atual em tabs
      const updatedTabs = syncActiveTab(current);

      if (tabId === 'home') {
        set({
          tabs: updatedTabs,
          activeTabId: 'home',
          session: null,
          snapshot: null,
          history: null,
          context: { kind: 'local' },
          commitFiles: [],
          commitStats: null,
          commitDetails: null,
          selectedFile: null,
          preview: null,
          commitMessage: '',
          remotes: [],
          authState: null,
          filesTab: 'changes',
          commandLogs: [],
          operation: null,
          refreshing: false,
        });
        saveOpenTabs(updatedTabs.map((t) => t.path), 'home');
        return;
      }

      const targetTab = updatedTabs.find((t) => t.id === tabId);
      if (!targetTab) return;

      const updatedRecents = [
        { path: targetTab.path, name: targetTab.name, lastOpened: Date.now() },
        ...current.recentRepos.filter((r) => r.path !== targetTab.path),
      ].slice(0, 20);

      const targetSessionId = targetTab.session.sessionId;
      const targetOp = current.operationsBySession?.[targetSessionId] ?? null;
      const targetRefreshing = manualRefreshingSessions.has(targetSessionId);

      set({
        tabs: updatedTabs,
        activeTabId: targetTab.id,
        recentRepos: updatedRecents,
        session: targetTab.session,
        snapshot: targetTab.snapshot,
        history: targetTab.history,
        context: targetTab.context,
        commitFiles: targetTab.commitFiles,
        commitStats: targetTab.commitStats ?? null,
        commitDetails: targetTab.commitDetails ?? null,
        selectedFile: targetTab.selectedFile,
        preview: targetTab.preview,
        commitMessage: targetTab.commitMessage,
        remotes: targetTab.remotes ?? [],
        authState: targetTab.authState ?? null,
        filesTab: targetTab.filesTab ?? 'changes',
        commandLogs: targetTab.commandLogs ?? [],
        operation: targetOp,
        refreshing: targetRefreshing,
        notice: null,
      });

      saveOpenTabs(updatedTabs.map((t) => t.path), targetTab.id);
      saveRecentRepos(updatedRecents);

      if (!targetTab.snapshot) {
        await refreshSession(targetSessionId, 'manual');
      } else {
        void refreshSession(targetSessionId, 'focus');
      }
    },

    openHome() {
      void get().switchTab('home');
    },

    removeRecentRepo(path) {
      const updated = get().recentRepos.filter((r) => r.path !== path);
      set({ recentRepos: updated });
      saveRecentRepos(updated);
    },

    clearRecentRepos() {
      set({ recentRepos: [] });
      saveRecentRepos([]);
    },

    async restoreSavedTabs() {
      const savedPaths = loadSavedTabs();
      const savedActive = loadSavedActiveTab();
      if (!savedPaths || savedPaths.length === 0) {
        set({ activeTabId: 'home' });
        return;
      }

      const openBackgroundBatch = async (paths: string[]) => {
        if (paths.length === 0) return;
        const bridge = getBridge();
        const token = openToken;
        const results = await Promise.all(
          paths.map(async (p) => {
            const current = get();
            if (current.tabs.some((t) => t.path === p || t.session.root === p)) return null;
            try {
              const session = await bridge.openRepository(p);
              return { session, path: p };
            } catch (error) {
              if (token === openToken) set({ notice: asError(error) });
              return null;
            }
          })
        );
        for (const item of results) {
          if (item) {
            await mountSession(item.session, item.path, token, { activate: false });
          }
        }
      };

      if (savedActive === 'home') {
        openToken++;
        await openBackgroundBatch(savedPaths);
        saveOpenTabs(
          get().tabs.map((t) => t.path),
          'home'
        );
        return;
      }

      const preferred = savedPaths.includes(savedActive ?? '') ? savedActive! : savedPaths[0];
      const remainingPaths = savedPaths.filter((path) => path !== preferred);
      let activatePending = true;

      await get().openRepository(preferred, { activate: activatePending });
      if (get().activeTabId !== 'home') activatePending = false;

      if (!activatePending) {
        await openBackgroundBatch(remainingPaths);
      } else {
        for (const path of remainingPaths) {
          await get().openRepository(path, { activate: activatePending });
          if (get().activeTabId !== 'home') activatePending = false;
        }
      }
    },

    async refresh(reason = 'manual', event) {
      const sessionId = event?.sessionId ?? get().session?.sessionId;
      if (!sessionId) return;
      await refreshSession(sessionId, reason, event);
    },
    async selectLocal() {
      if (get().context.kind === 'local') return;
      selectionToken++; contextToken++;
      const current = get();
      const selected = current.selectedFile;
      const local = current.snapshot ? localFiles(current.snapshot) : [];
      const selectedFile = selected?.area === 'repo'
        ? selected
        : (selected ? local.find((f) => sameFile(f, selected)) ?? null : null);
      set({
        context: { kind: 'local' },
        commitFiles: [],
        commitStats: null,
        commitDetails: null,
        selectedFile,
      });
      const file = get().selectedFile;
      if (file) await previewFile(file, ++nextRequestId); else set({ preview: null });
    },
    async selectCommit(oid) {
      const current = get();
      const session = current.session; if (!session) return;
      const key = commitKey(session.sessionId, oid);
      const cached = commitFilesCache.get(key);
      if (current.context.kind === 'commit' && current.context.oid === oid && cached) return;
      selectionToken++; const token = ++contextToken;
      set({
        context: { kind: 'commit', oid },
        commitFiles: cached?.files ?? [],
        commitStats: cached?.stats ?? null,
        commitDetails: cached?.details ?? null,
        selectedFile: null,
        preview: null,
      });
      if (cached) return;
      const requestId = ++nextRequestId;
      try {
        const result: CommitFiles = await getBridge().getCommitFiles(session.sessionId, requestId, oid);
        const current = get();
        if (token === contextToken && current.session?.sessionId === session.sessionId && current.context.kind === 'commit' && current.context.oid === oid && result.requestId === requestId) {
          remember(commitFilesCache, key, result, 64);
          set({
            commitFiles: result.files,
            commitStats: result.stats ?? null,
            commitDetails: result.details ?? null,
          });
        }
      } catch (error) { if (token === contextToken && get().session?.sessionId === session.sessionId) set({ notice: asError(error) }); }
    },
    async compareCommits(baseOid, targetOid) {
      const session = get().session; if (!session) return;
      const bridge = getBridge();
      if (!bridge.compareCommits) return;
      const requestId = ++nextRequestId;
      selectionToken++; const token = ++contextToken;
      set({
        context: { kind: 'compare', baseOid, targetOid },
        compareOids: [baseOid, targetOid],
        commitFiles: [],
        commitStats: null,
        commitDetails: null,
        selectedFile: null,
        preview: null,
      });
      try {
        const result: CommitFiles = await bridge.compareCommits(session.sessionId, requestId, baseOid, targetOid);
        const current = get();
        if (token === contextToken && current.session?.sessionId === session.sessionId && current.context.kind === 'compare' && current.context.baseOid === baseOid && current.context.targetOid === targetOid && result.requestId === requestId) {
          const firstFile = result.files[0] ?? null;
          set({
            commitFiles: result.files,
            commitStats: result.stats ?? null,
            commitDetails: null,
            selectedFile: firstFile,
          });
          if (firstFile) {
            void previewFile(firstFile, ++nextRequestId);
          }
        }
      } catch (error) { if (token === contextToken && get().session?.sessionId === session.sessionId) set({ notice: asError(error) }); }
    },
    async selectFile(file, options) {
      const current = get();
      if (
        file &&
        current.selectedFile &&
        current.selectedFile.id === file.id &&
        current.selectedFile.area === file.area &&
        current.preview
      ) {
        return;
      }
      const cachedPreview = file && current.session
        ? current.context.kind === 'commit'
          ? commitPreviewCache.get(previewKey(current.session.sessionId, current.context.oid, file.id)) ?? null
          : current.context.kind === 'local'
            ? localPreviewCache.get(localKey(current.session.sessionId, file.id)) ?? null
            : null
        : null;
      selectionToken++;
      set({
        selectedFile: file,
        preview: options?.deferPreview ? null : cachedPreview,
      });
      if (file && !options?.deferPreview && (current.context.kind === 'local' || !cachedPreview)) await previewFile(file, ++nextRequestId);
    },
    prefetchFile(file) {
      const state = get();
      if (!state.session || state.context.kind === 'compare' || sameFile(state.selectedFile, file)) return;
      const key = filePreviewKey(state.session.sessionId, state.context, file.id);
      const cached = state.context.kind === 'local' ? localPreviewCache.get(key)
        : state.context.kind === 'commit' ? commitPreviewCache.get(key) : null;
      if (cached || previewPrefetches.has(key) || previewPrefetches.size >= MAX_CONCURRENT_PREFETCHES) return;
      const request = getBridge().getFilePreview(state.session.sessionId, ++nextRequestId, file.id);
      previewPrefetches.set(key, request);
      void request.then((preview) => {
        if (preview.fileId !== file.id) return;
        if (state.context.kind === 'local' && key === localKey(state.session!.sessionId, file.id)) {
          remember(localPreviewCache, key, preview, LOCAL_PREVIEW_CACHE_LIMIT);
        } else if (state.context.kind === 'commit') {
          remember(commitPreviewCache, key, preview, COMMIT_PREVIEW_CACHE_LIMIT);
        }
      }).catch(() => undefined).finally(() => {
        if (previewPrefetches.get(key) === request) previewPrefetches.delete(key);
      });
    },
    async loadMore() {
      const state = get();
      if (!state.session || !state.history?.hasMore) return;
      const token = historyScopeToken;
      const pending = loadingMore;
      if (pending && pending.sessionId === state.session.sessionId && pending.historyKey === state.history.historyKey && pending.token === token && pending.page === state.history.page + 1) return;
      const requestId = ++nextRequestId;
      const requestedPage = state.history.page + 1;
      loadingMore = { sessionId: state.session.sessionId, historyKey: state.history.historyKey, page: requestedPage, token };
      try {
        const allBranches = state.historyScope !== 'current';
        const more = await getBridge().getHistory(state.session.sessionId, requestId, state.history.page + 1, allBranches);
        const current = get();
        if (token === historyScopeToken && current.session?.sessionId === state.session.sessionId && current.history === state.history && more.requestId === requestId && current.history?.historyKey === more.historyKey && current.snapshot?.historyKey === more.historyKey && current.history.page + 1 === more.page) {
          const updatedHistory = { ...more, rows: [...current.history.rows, ...more.rows] };
          set({ history: updatedHistory });
        }
      } catch (error) { if (token === historyScopeToken && get().session?.sessionId === state.session.sessionId) set({ notice: asError(error) }); }
      finally { if (loadingMore?.sessionId === state.session.sessionId && loadingMore.page === requestedPage && loadingMore.token === token) loadingMore = null; }
    },
    async runOperation(operation, fileIds, customMessage) {
      const initial = get();
      if (!initial.session) return;
      const targetSession = initial.session;
      const sessionId = targetSession.sessionId;
      if (
        writeReservedBySession.has(sessionId) ||
        initial.operationsBySession?.[sessionId] ||
        initial.operation
      ) {
        return;
      }
      if (operation === 'commit' || operation === 'commitAmend') {
        if (initial.context.kind !== 'local') return;
        if (operation === 'commit') {
          if (!initial.commitMessage.trim()) { notify({ category: 'validation', message: 'Escreva uma mensagem de commit.' }, set); return; }
          if (!initial.snapshot?.staged.length) { notify({ category: 'validation', message: 'Adicione arquivos ao stage antes do commit.' }, set); return; }
        } else if (operation === 'commitAmend') {
          if (!initial.snapshot?.staged.length && !initial.commitMessage.trim()) {
            notify({ category: 'validation', message: 'Para emendar (amend), adicione alterações ao stage ou informe a mensagem.' }, set);
            return;
          }
        }
        if (initial.snapshot?.conflicted) { notify({ category: 'validation', message: 'Resolva os conflitos antes do commit.' }, set); return; }
      }
      const targetTab = initial.tabs.find((t) => t.session.sessionId === sessionId);
      const repoLabel = targetTab?.name ?? targetSession.name;
      const ids = fileIds ?? (NO_FILE_OPERATIONS.has(operation) ? [] : initial.selectedFile ? [initial.selectedFile.id] : []);
      const initialCommitMessage = initial.commitMessage;
      const messageToSend = customMessage !== undefined
        ? (operation === 'mergeBranch' && initial.mergeStrategy !== 'default' && !customMessage.startsWith('{'))
          ? JSON.stringify({ branch: customMessage, strategy: initial.mergeStrategy })
          : (operation === 'openEditor' && !customMessage.startsWith('{'))
            ? JSON.stringify({ path: customMessage, editor: initial.preferredEditor })
            : customMessage
        : (operation === 'commit' || operation === 'commitAmend')
          ? initialCommitMessage
          : operation === 'pull'
            ? initial.pullStrategy
            : operation === 'openEditor'
              ? JSON.stringify({ path: '', editor: initial.preferredEditor })
              : '';

      writeReservedBySession.add(sessionId);
      setSessionOperation(sessionId, operation);

      const execute = async () => {
        const requestId = ++nextRequestId;
        const logCmd = formatGitLogCommand(operation, ids, messageToSend);
        let shouldRefreshAfter = false;
        try {
          const result = await getBridge().applyOperation(sessionId, requestId, operation, ids, messageToSend);
          const latest = get();
          const isActive = latest.session?.sessionId === sessionId;
          const tabExists = isActive || latest.tabs.some((t) => t.session.sessionId === sessionId);
          if (tabExists) {
            if (!NO_REFRESH_OPERATIONS.has(operation)) {
              const entry: CommandLogEntry = {
                id: String(requestId),
                command: logCmd,
                output: result.message,
                status: 'success',
                timestamp: Date.now(),
                isCustomCli: operation === 'gitCommand',
              };
              appendCommandLog(sessionId, entry);
              invalidateLocalPreviews(sessionId);
              shouldRefreshAfter = true;
            }
            if (operation !== 'gitCommand') {
              const noticeMessage = isActive ? result.message : `[${repoLabel}] ${result.message}`;
              notify({ category: 'success', message: noticeMessage }, set);
            }
            if (operation === 'commit' || operation === 'commitAmend') {
              set((s) => {
                const activeMatch = s.session?.sessionId === sessionId && s.commitMessage === initialCommitMessage;
                return {
                  ...(activeMatch ? { commitMessage: '' } : {}),
                  tabs: s.tabs.map((t) =>
                    t.session.sessionId === sessionId && t.commitMessage === initialCommitMessage
                      ? { ...t, commitMessage: '' }
                      : t
                  ),
                };
              });
            }
            setSessionOperation(sessionId, null);
            if (shouldRefreshAfter) {
              await refreshSession(sessionId, 'mutation');
            }
          }
        } catch (error) {
          const latest = get();
          const isActive = latest.session?.sessionId === sessionId;
          const tabExists = isActive || latest.tabs.some((t) => t.session.sessionId === sessionId);
          if (tabExists) {
            const err = asError(error);
            if (!NO_REFRESH_OPERATIONS.has(operation)) {
              const entry: CommandLogEntry = {
                id: String(requestId),
                command: logCmd,
                output: err.message + (err.details ? `\n${err.details}` : ''),
                status: 'error',
                timestamp: Date.now(),
                isCustomCli: operation === 'gitCommand',
              };
              appendCommandLog(sessionId, entry);
            }
            notify(
              isActive ? err : { ...err, message: `[${repoLabel}] ${err.message}` },
              set
            );
          }
        } finally {
          writeReservedBySession.delete(sessionId);
          setSessionOperation(sessionId, null);
        }
      };

      const prevChain = writeChainBySession.get(sessionId) ?? Promise.resolve();
      const nextChain = prevChain.then(execute, execute);
      writeChainBySession.set(sessionId, nextChain);
      try {
        await nextChain;
      } finally {
        if (writeChainBySession.get(sessionId) === nextChain) {
          writeChainBySession.delete(sessionId);
        }
      }
    },
    setCommitMessage: (commitMessage) => set({ commitMessage }),
    setDiffMode: (diffMode) => set({ diffMode }),
    setCompactDiff: (compactDiff) => set({ compactDiff }),
    setFileViewMode: (fileViewMode) => set({ fileViewMode }),
    dismissNotice: () => {
      if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
      set({ notice: null });
    },
  };
});
