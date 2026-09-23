export type Context = { kind: 'local' } | { kind: 'commit'; oid: string } | { kind: 'compare'; baseOid: string; targetOid: string };
export type Area = 'staged' | 'unstaged' | 'commit';
export type Status = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted';
export interface DiffStat { filesChanged: number; insertions: number; deletions: number }
export interface FileEntry {
  id: string;
  name: string;
  directory: string;
  pathDisplay: string;
  oldPathDisplay: string | null;
  status: Status;
  area: Area;
  insertions?: number | null;
  deletions?: number | null;
  isBinary?: boolean | null;
}
export interface Session { sessionId: string; root: string; name: string; warning?: AppError | null }
export interface InProgressState { kind: 'merge' | 'rebase' | 'cherryPick' | 'revert'; message?: string | null }
export interface Snapshot {
  sessionId: string;
  requestId: number;
  revision: number;
  branch: string | null;
  upstream: string | null;
  ahead?: number | null;
  behind?: number | null;
  conflicted: boolean;
  inProgress?: InProgressState | null;
  staged: FileEntry[];
  unstaged: FileEntry[];
  historyKey: string;
  stagedStats?: DiffStat | null;
  unstagedStats?: DiffStat | null;
}
export interface RemoteEntry {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}
export interface RemotesResult {
  sessionId: string;
  requestId: number;
  remotes: RemoteEntry[];
}
export interface CommitDetails {
  oid: string;
  parents: string[];
  refs: string[];
  authorName: string;
  authorEmail: string;
  authorTimestamp: number;
  committerName: string;
  committerEmail: string;
  committerTimestamp: number;
  subject: string;
  body: string;
}
export interface BlameLine {
  lineNumber: number;
  commitOid: string;
  author: string;
  authorMail: string;
  authorTimestamp: number;
  summary: string;
}
export interface BlameResult {
  lines: BlameLine[];
}
export interface FileHistoryEntry {
  oid: string;
  author: string;
  email: string;
  timestamp: number;
  summary: string;
}
export interface FileHistoryResult {
  entries: FileHistoryEntry[];
}
export interface ReflogEntry {
  oid: string;
  selector: string;
  action: string;
  timestamp: number;
  author: string;
}
export interface ReflogResult {
  entries: ReflogEntry[];
}
export interface Commit { oid: string; parents: string[]; refs: string[]; author: string; timestamp: number; subject: string }
export interface GraphRow { commit: Commit; row: number; lane: number; parentLanes: number[]; connections: { from: number; to: number }[]; activeLanes: number[] }
export interface History { sessionId: string; requestId: number; page: number; rows: GraphRow[]; laneCount: number; hasMore: boolean; historyKey: string }
export interface CommitFiles { sessionId: string; requestId: number; oid: string; files: FileEntry[]; stats?: DiffStat | null; details?: CommitDetails | null }
export interface DiffHunk {
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  patch: string;
}
export interface Preview {
  sessionId: string;
  requestId: number;
  fileId: string;
  version: string;
  kind: 'text' | 'binary' | 'missing' | 'tooLarge' | 'conflict';
  original: string;
  modified: string;
  message: string | null;
  hunks?: DiffHunk[];
}
export interface RepoChanged { sessionId: string; scope: 'worktree' | 'history' | 'all'; paths: string[] }
export interface AppError { category: string; message: string; details?: string | null }
export type Operation =
  | 'stage'
  | 'unstage'
  | 'stageAll'
  | 'unstageAll'
  | 'discard'
  | 'discardAll'
  | 'stageHunk'
  | 'unstageHunk'
  | 'discardHunk'
  | 'ignorePath'
  | 'openTerminal'
  | 'openEditor'
  | 'revealFile'
  | 'resolveConflict'
  | 'addRemote'
  | 'removeRemote'
  | 'setRemoteUrl'
  | 'fetchPrune'
  | 'commit'
  | 'commitAmend'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'forcePushWithLease'
  | 'switchBranch'
  | 'createBranch'
  | 'mergeBranch'
  | 'mergeSquash'
  | 'mergeAbort'
  | 'deleteBranch'
  | 'deleteRemoteBranch'
  | 'cherryPick'
  | 'cherryPickAbort'
  | 'cherryPickContinue'
  | 'stashPush'
  | 'stashPop'
  | 'stashApply'
  | 'stashDrop'
  | 'reset'
  | 'revertCommit'
  | 'createTag'
  | 'deleteTag'
  | 'pushTag'
  | 'rebase'
  | 'rebaseContinue'
  | 'rebaseAbort'
  | 'rebaseSkip'
  | 'openBrowser'
  | 'restoreCommitFile';
export interface OperationResult { sessionId: string; requestId: number; message: string }
export type DiffMode = 'unified' | 'split';
export type FileViewMode = 'flat' | 'tree';

export interface TabItem {
  id: string;
  path: string;
  name: string;
  session: Session;
  snapshot: Snapshot | null;
  history: History | null;
  context: Context;
  commitFiles: FileEntry[];
  commitStats?: DiffStat | null;
  commitDetails?: CommitDetails | null;
  selectedFile: FileEntry | null;
  preview: Preview | null;
  commitMessage: string;
  color?: string | null;
  remotes?: RemoteEntry[];
}

export interface RecentRepo {
  path: string;
  name: string;
  lastOpened: number;
}

export interface ThemeColors {
  bg: string;
  surface: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  green: string;
  red: string;
  selected: string;
  tabBarBg?: string;
  tabActiveBg?: string;
  tabActiveText?: string;
  monacoBase?: 'vs-dark' | 'vs';
}

export interface ThemeDefinition {
  id: string;
  name: string;
  author?: string;
  type: 'dark' | 'light';
  colors: ThemeColors;
}

export type SupportedLocale = 'pt-BR' | 'en-US' | 'es';
