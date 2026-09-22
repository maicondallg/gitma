import { create } from 'zustand';
import { getBridge } from '../lib/bridge';
import type { AppError, CommitDetails, CommitFiles, Context, DiffMode, DiffStat, FileEntry, FileViewMode, History, Operation, Preview, RecentRepo, RepoChanged, Session, Snapshot, TabItem } from '../lib/types';

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
  notice: Notice | null;
  fileHistoryPath: string | null;
  reflogOpen: boolean;
  remotesModalOpen: boolean;
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
  setHistoryScope(scope: 'all' | 'current'): Promise<void>;
  compareCommits(baseOid: string, targetOid: string): Promise<void>;
  resolveConflict(path: string, choice: 'ours' | 'theirs' | 'both' | 'mark_resolved'): Promise<void>;

  openRepository(path?: string): Promise<void>;
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
  reorderTabs(sourceIndex: number, destinationIndex: number): void;
  reorderTabsList(tabs: TabItem[]): void;
  setTabName(tabId: string, name: string): void;
  setTabColor(tabId: string, color: string | null): void;
  groupNames: Record<string, string>;
  setGroupName(color: string, name: string | null): void;
  preferredTerminal: string;
  setPreferredTerminal(terminal: string): void;
  openTerminal(customTerminal?: string): Promise<void>;
  openHome(): void;
  removeRecentRepo(path: string): void;
  clearRecentRepos(): void;
  restoreSavedTabs(): Promise<void>;

  refresh(reason?: RefreshReason, event?: RepoChanged): Promise<void>;
  selectLocal(): Promise<void>;
  selectCommit(oid: string): Promise<void>;
  selectFile(file: FileEntry | null): Promise<void>;
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
  dismissNotice(): void;
}

let nextRequestId = 0;
let selectionToken = 0;
let contextToken = 0;
let historyScopeToken = 0;
let openToken = 0;
let refreshInFlight = false;
let queuedRefresh: { reason: RefreshReason; event?: RepoChanged } | null = null;
let writeChain: Promise<void> = Promise.resolve();
let writeReserved = false;
let loadingMore: { sessionId: string; historyKey: string; page: number; token: number } | null = null;
let unlisten: (() => void) | null = null;

const asError = (error: unknown): AppError => {
  if (typeof error === 'object' && error && 'message' in error) return error as AppError;
  return { category: 'unknown', message: String(error) };
};
const sameFile = (a: FileEntry | null, b: FileEntry | null) => a?.id === b?.id && a?.area === b?.area;
const localFiles = (snapshot: Snapshot) => [...snapshot.staged, ...snapshot.unstaged];
const priority: Record<RefreshReason, number> = { watcher: 0, focus: 1, manual: 2, mutation: 3 };
function mergeRefresh(current: typeof queuedRefresh, next: { reason: RefreshReason; event?: RepoChanged }) {
  if (!current) return next;
  const reason = priority[next.reason] >= priority[current.reason] ? next.reason : current.reason;
  const scopes = [current.event?.scope, next.event?.scope];
  const scope: RepoChanged['scope'] = scopes.includes('all') ? 'all' : scopes.includes('history') ? 'history' : 'worktree';
  const paths = [...new Set([...(current.event?.paths ?? []), ...(next.event?.paths ?? [])])];
  const event = current.event || next.event ? { sessionId: next.event?.sessionId ?? current.event!.sessionId, scope, paths } : undefined;
  return { reason, event };
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

  async function previewFile(file: FileEntry | null, requestId: number) {
    const token = ++selectionToken;
    const context = contextToken;
    const state = get();
    if (!file || !state.session) {
      set((s) => ({
        preview: null,
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, preview: null } : t)),
      }));
      return;
    }
    try {
      const preview = await getBridge().getFilePreview(state.session.sessionId, requestId, file.id);
      const current = get();
      if (token === selectionToken && context === contextToken && current.session?.sessionId === state.session.sessionId && sameFile(current.selectedFile, file) && preview.requestId === requestId) {
        if (current.preview?.version !== preview.version) {
          set((s) => ({
            preview,
            tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, preview } : t)),
          }));
        }
      }
    } catch (error) {
      const current = get();
      if (token === selectionToken && context === contextToken && current.session?.sessionId === state.session.sessionId && sameFile(current.selectedFile, file)) {
        set({ notice: asError(error) });
      }
    }
  }

  async function doRefresh(reason: RefreshReason, event?: RepoChanged) {
    const before = get();
    if (!before.session) return;
    const requestId = ++nextRequestId;
    set({ refreshing: true });
    try {
      const snapshot = await getBridge().getSnapshot(before.session.sessionId, requestId);
      const current = get();
      if (current.session?.sessionId !== before.session.sessionId || snapshot.requestId !== requestId) return;
      const historyChanged = current.snapshot?.historyKey !== snapshot.historyKey || current.snapshot?.branch !== snapshot.branch;
      const files = current.context.kind === 'local' ? localFiles(snapshot) : current.commitFiles;
      const selectedFile = (current.selectedFile && files.find((f) => sameFile(f, current.selectedFile))) || null;
      const selectionLost = current.context.kind === 'local' && !!current.selectedFile && !selectedFile;
      const snapshotChanged = current.snapshot?.revision !== snapshot.revision;
      if (snapshotChanged || current.snapshot?.historyKey !== snapshot.historyKey || !sameFile(current.selectedFile, selectedFile)) {
        const update = selectionLost ? { snapshot, selectedFile, preview: null } : { snapshot, selectedFile };
        set((s) => ({
          ...update,
          tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, ...update } : t)),
        }));
      }
      const selectedPath = current.selectedFile?.pathDisplay;
      const changedSelectedPath = !!selectedPath && !!event?.paths.some((path) => path === selectedPath || selectedPath.startsWith(`${path}/`) || path.startsWith(`${selectedPath}/`));
      const shouldPreview = reason === 'manual' || reason === 'mutation' || (reason === 'focus' ? snapshotChanged : (!event || event.scope !== 'worktree' || changedSelectedPath));
      if (current.context.kind === 'local' && shouldPreview) void previewFile(selectedFile, requestId);
      if (historyChanged || !current.history) {
        const scopeToken = historyScopeToken;
        const allBranches = get().historyScope !== 'current';
        const history = await getBridge().getHistory(before.session.sessionId, requestId, 0, allBranches);
        if (scopeToken === historyScopeToken && get().session?.sessionId === before.session.sessionId && history.requestId === requestId && get().snapshot?.historyKey === snapshot.historyKey) {
          set((s) => ({
            history,
            tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, history } : t)),
          }));
        }
      }
    } catch (error) {
      if (get().session?.sessionId === before.session.sessionId) set({ notice: asError(error) });
    } finally {
      if (get().session?.sessionId === before.session.sessionId) set({ refreshing: false });
    }
  }

  async function mountSession(session: Session, selectedPath: string, token: number) {
    if (token !== openToken) {
      void getBridge().closeRepository(session.sessionId);
      return;
    }

    const current = get();
    // Preserva o estado da aba anterior se houver
    const currentTabs = current.activeTabId !== 'home'
      ? current.tabs.map((t) =>
          t.id === current.activeTabId
            ? {
                ...t,
                snapshot: current.snapshot,
                history: current.history,
                context: current.context,
                commitFiles: current.commitFiles,
                commitStats: current.commitStats,
                selectedFile: current.selectedFile,
                preview: current.preview,
                commitMessage: current.commitMessage,
              }
            : t
        )
      : current.tabs;

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
    };

    const newTabs = [...currentTabs, newTab];
    const updatedRecents = [
      { path: session.root, name: session.name, lastOpened: Date.now() },
      ...current.recentRepos.filter((r) => r.path !== session.root),
    ].slice(0, 20);

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
      notice: session.warning ?? null,
    });

    saveOpenTabs(newTabs.map((t) => t.path), newTab.id);
    saveRecentRepos(updatedRecents);

    if (!unlisten) {
      unlisten = await getBridge().onRepoChanged((event) => {
        const state = get();
        if (event.sessionId === state.session?.sessionId) {
          void state.refresh('watcher', event);
        } else {
          const bgTab = state.tabs.find((t) => t.session.sessionId === event.sessionId);
          if (bgTab) bgTab.snapshot = null;
        }
      });
    }

    await get().refresh('manual');
  }

  return {
    tabs: [],
    activeTabId: 'home',
    recentRepos: loadRecentRepos(),
    groupNames: loadSavedGroupNames(),
    preferredTerminal: loadSavedTerminal(),

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
    commitMessage: '',
    fileHistoryPath: null,
    reflogOpen: false,
    remotesModalOpen: false,
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
    async setHistoryScope(scope) {
      const current = get();
      if (current.historyScope === scope) return;
      const token = ++historyScopeToken;
      set((state) => ({
        historyScope: scope,
        history: null,
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
    async resolveConflict(path, choice) {
      await get().runOperation('resolveConflict', [], JSON.stringify({ path, choice }));
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
    notice: null,

    async openRepository(path) {
      if (writeReserved || get().operation) return;
      const token = ++openToken;
      set({ opening: true });
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
          await get().switchTab(existing.id);
          const updatedRecents = [
            { path: existing.path, name: existing.name, lastOpened: Date.now() },
            ...current.recentRepos.filter((r) => r.path !== existing.path),
          ].slice(0, 20);
          set({ recentRepos: updatedRecents });
          saveRecentRepos(updatedRecents);
          return;
        }

        const session = await bridge.openRepository(selectedPath);
        await mountSession(session, selectedPath, token);
      } catch (error) {
        if (token === openToken) set({ notice: asError(error) });
      } finally {
        if (token === openToken) set({ opening: false });
      }
    },

    async cloneRepository(source, destination) {
      if (writeReserved || get().operation) return;
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
      if (writeReserved || get().operation) return;
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
      if (writeReserved || get().operation) return;
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

      for (const p of targetPaths) {
        await get().openRepository(p);
      }
    },

    async closeTab(tabId) {
      const current = get();
      const tabToClose = current.tabs.find((t) => t.id === tabId);
      if (!tabToClose) return;

      void getBridge().closeRepository(tabToClose.session.sessionId);

      const remainingTabs = current.tabs.filter((t) => t.id !== tabId);

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
          });
          saveOpenTabs([], 'home');
        } else {
          const nextIndex = Math.min(closedIndex, remainingTabs.length - 1);
          const nextTab = remainingTabs[nextIndex];
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
          });
          saveOpenTabs(remainingTabs.map((t) => t.path), nextTab.id);
          if (!nextTab.snapshot) {
            await get().refresh('manual');
          } else {
            void get().refresh('focus');
          }
        }
      } else {
        set({ tabs: remainingTabs });
        saveOpenTabs(remainingTabs.map((t) => t.path), current.activeTabId);
      }
    },

    reorderTabs(sourceIndex, destinationIndex) {
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
      saveOpenTabs(reordered.map((t) => t.path), current.activeTabId);
    },

    reorderTabsList(newTabs) {
      const current = get();
      set({ tabs: newTabs });
      saveOpenTabs(newTabs.map((t) => t.path), current.activeTabId);
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

    async closeOtherTabs(tabId) {
      const current = get();
      const tabsToClose = current.tabs.filter((t) => t.id !== tabId);
      for (const t of tabsToClose) {
        void getBridge().closeRepository(t.session.sessionId);
      }
      const remaining = current.tabs.filter((t) => t.id === tabId);
      set({ tabs: remaining });
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
      for (const t of tabsToClose) {
        void getBridge().closeRepository(t.session.sessionId);
      }
      const remaining = current.tabs.slice(0, index + 1);
      const wasActiveClosed = tabsToClose.some((t) => t.id === current.activeTabId);
      set({ tabs: remaining });
      saveOpenTabs(remaining.map((t) => t.path), wasActiveClosed ? tabId : current.activeTabId);

      if (wasActiveClosed) {
        await get().switchTab(tabId);
      }
    },

    async switchTab(tabId) {
      const current = get();
      if (current.activeTabId === tabId) return;

      // Salva estado da aba atual em tabs
      const updatedTabs = current.activeTabId !== 'home'
        ? current.tabs.map((t) =>
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
                }
              : t
          )
        : current.tabs;

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
        notice: null,
      });

      saveOpenTabs(updatedTabs.map((t) => t.path), targetTab.id);
      saveRecentRepos(updatedRecents);

      if (!targetTab.snapshot) {
        await get().refresh('manual');
      } else {
        void get().refresh('focus');
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
      for (const path of savedPaths) {
        try {
          await get().openRepository(path);
        } catch {
          // Ignora repositórios que não existem mais
        }
      }
      if (savedActive === 'home') {
        get().openHome();
      } else if (savedActive) {
        const tabs = get().tabs;
        const match = tabs.find((t) => t.id === savedActive || t.path === savedActive);
        if (match) {
          await get().switchTab(match.id);
        }
      }
    },

    async refresh(reason = 'manual', event) {
      if (refreshInFlight) { queuedRefresh = mergeRefresh(queuedRefresh, { reason, event }); return; }
      refreshInFlight = true;
      try { await doRefresh(reason, event); }
      finally {
        refreshInFlight = false;
        const queued = queuedRefresh; queuedRefresh = null;
        if (queued) void get().refresh(queued.reason, queued.event);
      }
    },
    async selectLocal() {
      selectionToken++; contextToken++;
      const current = get();
      const selected = current.selectedFile;
      const local = current.snapshot ? localFiles(current.snapshot) : [];
      const selectedFile = selected ? local.find((f) => sameFile(f, selected)) ?? null : null;
      set((s) => ({
        context: { kind: 'local' },
        commitFiles: [],
        commitStats: null,
        commitDetails: null,
        selectedFile,
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, context: { kind: 'local' }, commitFiles: [], commitStats: null, commitDetails: null, selectedFile } : t)),
      }));
      const file = get().selectedFile;
      if (file) await previewFile(file, ++nextRequestId); else set({ preview: null });
    },
    async selectCommit(oid) {
      const session = get().session; if (!session) return;
      const requestId = ++nextRequestId;
      selectionToken++; const token = ++contextToken;
      set((s) => ({
        context: { kind: 'commit', oid },
        commitFiles: [],
        commitStats: null,
        commitDetails: null,
        selectedFile: null,
        preview: null,
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, context: { kind: 'commit', oid }, commitFiles: [], commitStats: null, commitDetails: null, selectedFile: null, preview: null } : t)),
      }));
      try {
        const result: CommitFiles = await getBridge().getCommitFiles(session.sessionId, requestId, oid);
        const current = get();
        if (token === contextToken && current.session?.sessionId === session.sessionId && current.context.kind === 'commit' && current.context.oid === oid && result.requestId === requestId) {
          set((s) => ({
            commitFiles: result.files,
            commitStats: result.stats ?? null,
            commitDetails: result.details ?? null,
            tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, commitFiles: result.files, commitStats: result.stats ?? null, commitDetails: result.details ?? null } : t)),
          }));
        }
      } catch (error) { if (token === contextToken && get().session?.sessionId === session.sessionId) set({ notice: asError(error) }); }
    },
    async compareCommits(baseOid, targetOid) {
      const session = get().session; if (!session) return;
      const bridge = getBridge();
      if (!bridge.compareCommits) return;
      const requestId = ++nextRequestId;
      selectionToken++; const token = ++contextToken;
      set((s) => ({
        context: { kind: 'compare', baseOid, targetOid },
        compareOids: [baseOid, targetOid],
        commitFiles: [],
        commitStats: null,
        commitDetails: null,
        selectedFile: null,
        preview: null,
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, context: { kind: 'compare', baseOid, targetOid }, commitFiles: [], commitStats: null, commitDetails: null, selectedFile: null, preview: null } : t)),
      }));
      try {
        const result: CommitFiles = await bridge.compareCommits(session.sessionId, requestId, baseOid, targetOid);
        const current = get();
        if (token === contextToken && current.session?.sessionId === session.sessionId && current.context.kind === 'compare' && current.context.baseOid === baseOid && current.context.targetOid === targetOid && result.requestId === requestId) {
          const firstFile = result.files[0] ?? null;
          set((s) => ({
            commitFiles: result.files,
            commitStats: result.stats ?? null,
            commitDetails: null,
            selectedFile: firstFile,
            tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, commitFiles: result.files, commitStats: result.stats ?? null, commitDetails: null, selectedFile: firstFile } : t)),
          }));
          if (firstFile) {
            void previewFile(firstFile, ++nextRequestId);
          }
        }
      } catch (error) { if (token === contextToken && get().session?.sessionId === session.sessionId) set({ notice: asError(error) }); }
    },
    async selectFile(file) {
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
      selectionToken++;
      set((s) => ({
        selectedFile: file,
        preview: null,
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, selectedFile: file, preview: null } : t)),
      }));
      if (file) await previewFile(file, ++nextRequestId);
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
          set((s) => ({
            history: updatedHistory,
            tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, history: updatedHistory } : t)),
          }));
        }
      } catch (error) { if (token === historyScopeToken && get().session?.sessionId === state.session.sessionId) set({ notice: asError(error) }); }
      finally { if (loadingMore?.sessionId === state.session.sessionId && loadingMore.page === requestedPage && loadingMore.token === token) loadingMore = null; }
    },
    async runOperation(operation, fileIds, customMessage) {
      if (writeReserved || get().operation || get().opening) return;
      const initial = get();
      if (!initial.session) return;
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
      writeReserved = true;
      set({ operation });
      const execute = async () => {
        const state = get(); if (!state.session) return;
        const NO_FILE_OPERATIONS = new Set<Operation>([
          'stageAll', 'unstageAll', 'discardAll', 'push', 'forcePushWithLease', 'fetch', 'pull',
          'switchBranch', 'createBranch', 'mergeBranch', 'mergeSquash', 'mergeAbort',
          'deleteBranch', 'deleteRemoteBranch',
          'cherryPick', 'cherryPickAbort', 'cherryPickContinue',
          'stashPush', 'stashPop', 'stashApply', 'stashDrop', 'commit', 'commitAmend',
          'reset', 'revertCommit', 'createTag', 'deleteTag', 'pushTag',
          'rebase', 'rebaseContinue', 'rebaseAbort', 'rebaseSkip',
          'stageHunk', 'unstageHunk', 'discardHunk', 'ignorePath', 'openTerminal', 'openEditor', 'revealFile'
        ]);
        const ids = fileIds ?? (NO_FILE_OPERATIONS.has(operation) ? [] : state.selectedFile ? [state.selectedFile.id] : []);
        const messageToSend = customMessage !== undefined
          ? (operation === 'mergeBranch' && state.mergeStrategy !== 'default' && !customMessage.startsWith('{'))
            ? JSON.stringify({ branch: customMessage, strategy: state.mergeStrategy })
            : customMessage
          : (operation === 'commit' || operation === 'commitAmend')
            ? state.commitMessage
            : operation === 'pull'
              ? state.pullStrategy
              : '';
        const requestId = ++nextRequestId;
        try {
          const result = await getBridge().applyOperation(state.session.sessionId, requestId, operation, ids, messageToSend);
          if (get().session?.sessionId === state.session.sessionId) {
            notify({ category: 'success', message: result.message }, set);
            if ((operation === 'commit' || operation === 'commitAmend') && get().commitMessage === state.commitMessage) {
              set((s) => ({
                commitMessage: '',
                tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, commitMessage: '' } : t)),
              }));
            }
            await get().refresh('mutation');
          }
        } catch (error) { if (get().session?.sessionId === state.session.sessionId) notify(asError(error), set); }
        finally { writeReserved = false; if (get().session?.sessionId === state.session.sessionId) set({ operation: null }); }
      };
      writeChain = writeChain.then(execute, execute);
      await writeChain;
    },
    setCommitMessage: (commitMessage) =>
      set((s) => ({
        commitMessage,
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, commitMessage } : t)),
      })),
    setDiffMode: (diffMode) => set({ diffMode }),
    setCompactDiff: (compactDiff) => set({ compactDiff }),
    setFileViewMode: (fileViewMode) => set({ fileViewMode }),
    dismissNotice: () => {
      if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
      set({ notice: null });
    },
  };
});
