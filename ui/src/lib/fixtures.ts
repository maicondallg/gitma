import { setBridgeAdapter, type BridgeAdapter } from './bridge';
import type { Commit, FileEntry, GraphRow, History, Preview, RepoChanged, Snapshot } from './types';

const file = (id: string, pathDisplay: string, area: FileEntry['area'], status: FileEntry['status'] = 'modified', insertions = 12, deletions = 4): FileEntry => {
  const parts = pathDisplay.split('/');
  return { id, name: parts.pop()!, directory: parts.join('/'), pathDisplay, oldPathDisplay: null, area, status, insertions, deletions, isBinary: false };
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
  let activeRepoName = 'Gitma';
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
      const repoName = root.split('/').filter(Boolean).pop() || 'Gitma';
      activeRepoName = repoName;
      return { sessionId: `session-${repoName}`, name: repoName, root };
    },
    cloneRepository: async (_source: string, destination: string) => {
      const root = destination;
      const repoName = root.split('/').filter(Boolean).pop() || 'Cloned';
      activeRepoName = repoName;
      return { sessionId: `session-${repoName}`, name: repoName, root };
    },
    initRepository: async (path: string, _defaultBranch?: string) => {
      const root = path;
      const repoName = root.split('/').filter(Boolean).pop() || 'NewRepo';
      activeRepoName = repoName;
      return { sessionId: `session-${repoName}`, name: repoName, root };
    },
    closeRepository: async () => { listener = null; },
    getSnapshot: async (_sessionId, requestId): Promise<Snapshot> => ({
      sessionId,
      requestId,
      revision,
      branch: 'main',
      upstream: 'origin/main',
      ahead: 1,
      behind: 2,
      conflicted: name === 'conflict',
      staged,
      unstaged,
      historyKey: 'demo-history',
      stagedStats: { filesChanged: staged.length, insertions: staged.length * 12, deletions: staged.length * 4 },
      unstagedStats: { filesChanged: unstaged.length, insertions: unstaged.length * 12, deletions: unstaged.length * 4 },
    }),
    getHistory: async (_sessionId, requestId, page, _allBranches): Promise<History> => ({ sessionId, requestId, page, rows: page === 0 ? graphRows : [], laneCount: 2, hasMore: false, historyKey: 'demo-history' }),
    compareCommits: async (_sessionId, requestId, baseOid, targetOid) => ({
      sessionId,
      requestId,
      oid: `${baseOid}..${targetOid}`,
      files: historyFiles,
      stats: { filesChanged: historyFiles.length, insertions: 14, deletions: 4 },
      details: null,
    }),
    getRemotes: async (_sessionId, requestId) => ({
      sessionId,
      requestId,
      remotes: [
        { name: 'origin', fetchUrl: `https://github.com/maicondallg/${activeRepoName}.git`, pushUrl: `https://github.com/maicondallg/${activeRepoName}.git` },
      ],
    }),
    getCommitFiles: async (_sessionId, requestId, oid) => ({
      sessionId,
      requestId,
      oid,
      files: historyFiles,
      stats: { filesChanged: historyFiles.length, insertions: 24, deletions: 8 },
      details: {
        oid,
        parents: ['e0c5badd5604b48471db96c73d48a5a5475ec0dd'],
        refs: ['main', 'origin/main'],
        authorName: 'Maicon',
        authorEmail: 'maicon@example.com',
        authorTimestamp: 1789616075,
        committerName: 'Maicon',
        committerEmail: 'maicon@example.com',
        committerTimestamp: 1789616075,
        subject: 'Exemplo de commit demonstrativo',
        body: 'Esta é uma descrição detalhada do commit para testes visuais.\n\nContém múltiplas linhas e referências como #42 e 761202e.',
      },
    }),
    getFilePreview: async (_sessionId, requestId, fileId): Promise<Preview> => ({
      sessionId,
      requestId,
      fileId,
      version: `demo-${fileId}`,
      kind: name === 'binary' ? 'binary' : name === 'conflict' ? 'conflict' : 'text',
      original,
      modified,
      message: name === 'binary' ? 'Arquivo binário — comparação textual indisponível.' : name === 'conflict' ? 'Resolva o conflito antes de commitar.' : null,
      hunks: name !== 'binary' && name !== 'conflict' ? [
        {
          id: 'hunk-0',
          header: '@@ -1,5 +1,6 @@',
          oldStart: 1,
          oldLines: 5,
          newStart: 1,
          newLines: 6,
          patch: 'diff --git a/demo.ts b/demo.ts\n--- a/demo.ts\n+++ b/demo.ts\n@@ -1,5 +1,6 @@\n',
        },
      ] : [],
    }),
    getBlame: async (_sessionId, _requestId, _path) => ({
      lines: Array.from({ length: 20 }, (_, i) => ({
        lineNumber: i + 1,
        commitOid: 'e0c5badd5604b48471db96c73d48a5a5475ec0dd',
        author: 'Maicon',
        authorMail: 'maicon@example.com',
        authorTimestamp: 1789616075,
        summary: 'First release',
      })),
    }),
    getFileHistory: async (_sessionId, _requestId, path) => ({
      entries: [
        {
          oid: '761202e26c7aa548792dbda3aee101bbfe18dafc',
          path,
          author: 'Maicon',
          email: 'maicon@example.com',
          timestamp: 1789942318,
          summary: 'fix: windows infinity create window',
        },
        {
          oid: 'e0c5badd5604b48471db96c73d48a5a5475ec0dd',
          path,
          author: 'Maicon',
          email: 'maicon@example.com',
          timestamp: 1789616075,
          summary: 'First release',
        },
      ],
    }),
    getFileHistoryPreview: async (_sessionId, requestId, oid, path): Promise<Preview> => ({
      sessionId,
      requestId,
      fileId: `${oid}:${path}`,
      version: `${oid}:${path}`,
      kind: 'text',
      original,
      modified,
      message: null,
      hunks: [],
    }),
    getReflog: async (_sessionId, _requestId) => ({
      entries: [
        {
          oid: '761202e26c7aa548792dbda3aee101bbfe18dafc',
          selector: 'HEAD@{0}',
          action: 'commit: fix: windows infinity create window',
          timestamp: 1789942318,
          author: 'Maicon',
        },
        {
          oid: 'e0c5badd5604b48471db96c73d48a5a5475ec0dd',
          selector: 'HEAD@{1}',
          action: 'commit: First release',
          timestamp: 1789616075,
          author: 'Maicon',
        },
      ],
    }),
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
