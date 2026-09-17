import { setBridgeAdapter, type BridgeAdapter } from './bridge';
import type { Commit, FileEntry, GraphRow, History, Preview, RepoChanged, Snapshot } from './types';

const file = (id: string, pathDisplay: string, area: FileEntry['area'], status: FileEntry['status'] = 'modified'): FileEntry => {
  const parts = pathDisplay.split('/');
  return { id, name: parts.pop()!, directory: parts.join('/'), pathDisplay, oldPathDisplay: null, area, status };
};
const commits: Commit[] = [
  { oid: 'a91cf08032a', parents: ['b8345cd1'], subject: 'Refine repository workspace', refs: ['HEAD -> main', 'origin/main', 'main'], author: 'Maicon', timestamp: 1789600000 },
  { oid: 'b8345cd1', parents: ['c45e3021', 'd792eaf1'], subject: "Merge branch 'feature/diff'", refs: [], author: 'Maicon', timestamp: 1789500000 },
  { oid: 'd792eaf1', parents: ['c45e3021'], subject: 'Add side-by-side diff view', refs: ['feature/diff'], author: 'Maicon', timestamp: 1789400000 },
  { oid: 'c45e3021', parents: ['e408bde1'], subject: 'Handle staged and unstaged changes', refs: [], author: 'Maicon', timestamp: 1789300000 },
  { oid: 'e408bde1', parents: ['f345afe1'], subject: 'Render history graph connections', refs: [], author: 'Maicon', timestamp: 1789200000 },
  { oid: 'f345afe1', parents: [], subject: 'Initial project structure', refs: ['tag: v0.1.1'], author: 'Maicon', timestamp: 1789100000 },
];
const graphRows: GraphRow[] = commits.map((commit, row) => ({
  commit, row, lane: row === 2 ? 1 : 0,
  parentLanes: row === 1 ? [0, 1] : row === 2 ? [0] : row === 5 ? [] : [0],
  connections: row === 1 ? [{ from: 0, to: 0 }, { from: 0, to: 1 }] : row === 2 ? [{ from: 1, to: 0 }] : row === 5 ? [] : [{ from: 0, to: 0 }],
  activeLanes: row === 2 ? [0, 1] : [0],
}));
const original = `import { repository } from './git';\n\nexport async function refreshRepository() {\n  const selected = state.selectedFile;\n  state.preview = null;\n  state.notice = null;\n  const snapshot = await repository.snapshot();\n  state.snapshot = snapshot;\n  state.selectedFile = selected;\n}\n`;
const modified = `import { repository } from './git';\n\nexport async function refreshRepository() {\n  const selected = state.selectedFile;\n  const snapshot = await repository.snapshot();\n  if (snapshot.revision !== state.snapshot?.revision) {\n    state.snapshot = snapshot;\n  }\n  state.selectedFile = selected;\n  await revalidatePreview(selected);\n}\n`;

export function createFixtureAdapter(name = 'local'): BridgeAdapter {
  const sessionId = 'demo-session';
  let revision = 1;
  let staged = name === 'clean' ? [] : [file('stage-app', 'src/app.ts', 'staged'), file('stage-cargo', 'Cargo.toml', 'staged')];
  let unstaged = name === 'clean' ? [] : [file('work-app', 'src/app.ts', 'unstaged'), file('work-schema', 'backend/prisma/schema.prisma', 'unstaged'), file('work-readme', 'README.md', 'unstaged'), file('work-tests', 'tests/workflows.ts', 'unstaged', 'untracked')];
  const historyFiles = [file('commit-app', 'src/app.ts', 'commit'), file('commit-theme', 'src/theme.css', 'commit', 'added')];
  let listener: ((event: RepoChanged) => void) | null = null;
  return {
    chooseFolder: async () => '/home/demo/projects/Gitma',
    startupOptions: async () => ({ repo: null, fixture: name }),
    openRepository: async (path?: string) => {
      const root = path ?? '/home/demo/projects/Gitma';
      const name = root.split('/').filter(Boolean).pop() || 'Gitma';
      return { sessionId: `session-${name}`, name, root };
    },
    cloneRepository: async (_source: string, destination: string) => {
      const root = destination;
      const name = root.split('/').filter(Boolean).pop() || 'Cloned';
      return { sessionId: `session-${name}`, name, root };
    },
    initRepository: async (path: string, _defaultBranch?: string) => {
      const root = path;
      const name = root.split('/').filter(Boolean).pop() || 'NewRepo';
      return { sessionId: `session-${name}`, name, root };
    },
    closeRepository: async () => { listener = null; },
    getSnapshot: async (_sessionId, requestId): Promise<Snapshot> => ({ sessionId, requestId, revision, branch: 'main', upstream: 'origin/main', conflicted: name === 'conflict', staged, unstaged, historyKey: 'demo-history' }),
    getHistory: async (_sessionId, requestId, page): Promise<History> => ({ sessionId, requestId, page, rows: page === 0 ? graphRows : [], laneCount: 2, hasMore: false, historyKey: 'demo-history' }),
    getCommitFiles: async (_sessionId, requestId, oid) => ({ sessionId, requestId, oid, files: historyFiles }),
    getFilePreview: async (_sessionId, requestId, fileId): Promise<Preview> => ({ sessionId, requestId, fileId, version: `demo-${fileId}`, kind: name === 'binary' ? 'binary' : name === 'conflict' ? 'conflict' : 'text', original, modified, message: name === 'binary' ? 'Arquivo binário — comparação textual indisponível.' : name === 'conflict' ? 'Resolva o conflito antes de commitar.' : null }),
    applyOperation: async (_sessionId, requestId, operation, ids) => {
      if ((operation === 'push' || operation === 'forcePushWithLease') && name === 'error') throw { category: 'diverged', message: 'O remoto contém commits novos. Faça fetch e revise o histórico.', details: 'Push rejected: non-fast-forward' };
      if (operation === 'stage' || operation === 'stageAll') {
        const moved = unstaged.filter((entry) => operation === 'stageAll' || ids.includes(entry.id));
        unstaged = unstaged.filter((entry) => !moved.includes(entry));
        for (const entry of moved) if (!staged.some((existing) => existing.pathDisplay === entry.pathDisplay)) staged = [...staged, { ...entry, id: `stage-${entry.id}`, area: 'staged' }];
      } else if (operation === 'unstage' || operation === 'unstageAll') {
        const moved = staged.filter((entry) => operation === 'unstageAll' || ids.includes(entry.id));
        staged = staged.filter((entry) => !moved.includes(entry));
        for (const entry of moved) if (!unstaged.some((existing) => existing.pathDisplay === entry.pathDisplay)) unstaged = [...unstaged, { ...entry, id: `work-${entry.id}`, area: 'unstaged' }];
      } else if (operation === 'commit' || operation === 'commitAmend') staged = [];
      revision++;
      listener?.({ sessionId, scope: 'all', paths: [] });
      return { sessionId, requestId, message: 'Operação concluída na demonstração.' };
    },
    onRepoChanged: async (callback) => { listener = callback; return () => { listener = null; }; },
  };
}

export function installFixtureAdapter(name: string) { setBridgeAdapter(createFixtureAdapter(name)); }
