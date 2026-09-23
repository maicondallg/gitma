import type {
  BlameResult, CommitFiles, Context, FileEntry, FileHistoryResult, History, Operation, OperationResult, Preview,
  ReflogResult, RemotesResult, RepoChanged, Session, Snapshot,
} from './types';
import { invoke as invokeNative, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

export interface BridgeAdapter {
  openRepository(path: string): Promise<Session>;
  cloneRepository?(source: string, destination: string): Promise<Session>;
  initRepository?(path: string, defaultBranch?: string): Promise<Session>;
  chooseFolder?(): Promise<string | null>;
  chooseFolders?(): Promise<string[]>;
  startupOptions?(): Promise<{ repo: string | null; fixture: string | null }>;
  closeRepository(sessionId: string): Promise<void>;
  getSnapshot(sessionId: string, requestId: number): Promise<Snapshot>;
  getHistory(sessionId: string, requestId: number, page: number, allBranches?: boolean): Promise<History>;
  getCommitFiles(sessionId: string, requestId: number, oid: string): Promise<CommitFiles>;
  compareCommits?(sessionId: string, requestId: number, baseOid: string, targetOid: string): Promise<CommitFiles>;
  getFilePreview(sessionId: string, requestId: number, fileId: string): Promise<Preview>;
  applyOperation(sessionId: string, requestId: number, operation: Operation, fileIds: string[], message: string): Promise<OperationResult>;
  getBlame(sessionId: string, requestId: number, path: string, commitOid?: string | null): Promise<BlameResult>;
  getFileHistory(sessionId: string, requestId: number, path: string, maxCount?: number): Promise<FileHistoryResult>;
  getFileHistoryPreview(sessionId: string, requestId: number, oid: string, path: string): Promise<Preview>;
  getReflog(sessionId: string, requestId: number, limit?: number): Promise<ReflogResult>;
  getRemotes?(sessionId: string, requestId: number): Promise<RemotesResult>;
  onRepoChanged(listener: (event: RepoChanged) => void): Promise<() => void>;
}

type TauriWindow = Window & { __Gitma_BRIDGE__?: BridgeAdapter };

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw { category: 'transport', message: 'Open this screen through Gitma or provide a browser bridge.' };
  return invokeNative<T>(command, args);
}

const nativeBridge: BridgeAdapter = {
  openRepository: (path) => invoke('open_repository', { path }),
  cloneRepository: (source, destination) => invoke('clone_repository', { source, destination }),
  initRepository: (path, defaultBranch) => invoke('init_repository', { path, defaultBranch: defaultBranch || null }),
  async chooseFolder() {
    const selected = await open({ directory: true, multiple: false, title: 'Abrir repositório Git' });
    return typeof selected === 'string' ? selected : null;
  },
  async chooseFolders() {
    const selected = await open({ directory: true, multiple: true, title: 'Abrir repositório(s) Git' });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  },
  startupOptions: () => invoke('startup_options', {}),
  closeRepository: (sessionId) => invoke('close_repository', { sessionId }),
  getSnapshot: (sessionId, requestId) => invoke('get_snapshot', { sessionId, requestId }),
  getHistory: (sessionId, requestId, page, allBranches) =>
    invoke('get_history', { sessionId, requestId, page, allBranches: allBranches ?? null }),
  getCommitFiles: (sessionId, requestId, oid) => invoke('get_commit_files', { sessionId, requestId, oid }),
  compareCommits: (sessionId, requestId, baseOid, targetOid) =>
    invoke('compare_commits', { sessionId, requestId, baseOid, targetOid }),
  getFilePreview: (sessionId, requestId, fileId) => invoke('get_file_preview', { sessionId, requestId, fileId }),
  applyOperation: (sessionId, requestId, operation, fileIds, message) =>
    invoke('apply_operation', { sessionId, requestId, operation, fileIds, message }),
  getBlame: (sessionId, requestId, path, commitOid) =>
    invoke('get_blame', { sessionId, requestId, path, commitOid: commitOid ?? null }),
  getFileHistory: (sessionId, requestId, path, maxCount) =>
    invoke('get_file_history', { sessionId, requestId, path, maxCount: maxCount ?? null }),
  getFileHistoryPreview: (sessionId, requestId, oid, path) =>
    invoke('get_file_history_preview', { sessionId, requestId, oid, path }),
  getReflog: (sessionId, requestId, limit) =>
    invoke('get_reflog', { sessionId, requestId, limit: limit ?? null }),
  getRemotes: (sessionId, requestId) =>
    invoke('get_remotes', { sessionId, requestId }),
  async onRepoChanged(listener) {
    if (!isTauri()) return () => undefined;
    return listen<RepoChanged>('repo-changed', (event) => listener(event.payload));
  },
};

let injectedAdapter: BridgeAdapter | null = null;

/** Test and browser-fixture seam. Set before mounting the application. */
export function setBridgeAdapter(adapter: BridgeAdapter | null) {
  injectedAdapter = adapter;
}

export function getBridge(): BridgeAdapter {
  return injectedAdapter ?? (window as TauriWindow).__Gitma_BRIDGE__ ?? nativeBridge;
}

export function isFixtureMode() {
  return new URLSearchParams(window.location.search).has('fixture');
}

export async function confirmDialog(message: string, title = 'Gitma'): Promise<boolean> {
  if (isTauri()) {
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      return await confirm(message, { title, kind: 'warning' });
    } catch {
      // Fallback to window.confirm if plugin fails
    }
  }
  return Boolean(window.confirm(message));
}

export type { Context, FileEntry };
