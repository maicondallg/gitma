import type {
  CommitFiles, Context, FileEntry, History, Operation, OperationResult, Preview,
  RepoChanged, Session, Snapshot,
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
  getHistory(sessionId: string, requestId: number, page: number): Promise<History>;
  getCommitFiles(sessionId: string, requestId: number, oid: string): Promise<CommitFiles>;
  getFilePreview(sessionId: string, requestId: number, fileId: string): Promise<Preview>;
  applyOperation(sessionId: string, requestId: number, operation: Operation, fileIds: string[], message: string): Promise<OperationResult>;
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
  getHistory: (sessionId, requestId, page) => invoke('get_history', { sessionId, requestId, page }),
  getCommitFiles: (sessionId, requestId, oid) => invoke('get_commit_files', { sessionId, requestId, oid }),
  getFilePreview: (sessionId, requestId, fileId) => invoke('get_file_preview', { sessionId, requestId, fileId }),
  applyOperation: (sessionId, requestId, operation, fileIds, message) =>
    invoke('apply_operation', { sessionId, requestId, operation, fileIds, message }),
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

export type { Context, FileEntry };
