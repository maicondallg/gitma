import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useAppStore } from '../store/app';
import { setBridgeAdapter } from '../lib/bridge';
import { setLanguage } from '../i18n';
import { RemotesModal } from './RemotesModal';
import { GraphPanel } from './GraphPanel';
import { DiffPanel } from './DiffPanel';
import { TabBar } from './TabBar';
import type { BridgeAdapter } from '../lib/bridge';
import type { RemotesResult } from '../lib/types';

vi.mock('../lib/monaco', () => ({
  monaco: {
    editor: {
      createDiffEditor: vi.fn(() => ({
        setModel: vi.fn(),
        getLineChanges: vi.fn(() => []),
        createViewModel: vi.fn((model) => ({ model, waitForDiff: vi.fn().mockResolvedValue(undefined) })),
        updateOptions: vi.fn(),
        dispose: vi.fn(),
        onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
        getOriginalEditor: vi.fn(() => ({
          render: vi.fn(),
          onDidChangeHiddenAreas: vi.fn(() => ({ dispose: vi.fn() })),
          _getViewModel: vi.fn(() => ({ getHiddenAreas: vi.fn(() => []) })),
        })),
        getModifiedEditor: vi.fn(() => ({
          render: vi.fn(),
          onDidChangeHiddenAreas: vi.fn(() => ({ dispose: vi.fn() })),
          _getViewModel: vi.fn(() => ({ getHiddenAreas: vi.fn(() => []) })),
          onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
          onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
          revealLineInCenter: vi.fn(),
          setPosition: vi.fn(),
          setScrollTop: vi.fn(),
          getScrollTop: vi.fn(() => 0),
          focus: vi.fn(),
        })),
      })),
      createModel: vi.fn(() => ({
        getLineCount: vi.fn(() => 2),
        dispose: vi.fn(),
      })),
      setTheme: vi.fn(),
    },
  },
  languageForPath: vi.fn(() => 'typescript'),
}));

vi.mock('../lib/theme', () => ({
  applyTheme: vi.fn(),
  registerEditorThemeApplier: vi.fn(),
  getActiveThemeId: vi.fn(() => 'dark'),
  getThemeById: vi.fn(() => ({})),
}));

describe('Phase 4 Features', () => {
  const mockBridge: Partial<BridgeAdapter> = {
    openRepository: vi.fn(),
    closeRepository: vi.fn(),
    getSnapshot: vi.fn(),
    getHistory: vi.fn(),
    getCommitFiles: vi.fn(),
    getFilePreview: vi.fn(),
    applyOperation: vi.fn(),
    onRepoChanged: vi.fn(async () => () => undefined),
    getRemotes: vi.fn(async () => ({
      remotes: [
        {
          name: 'origin',
          fetchUrl: 'https://github.com/maicondallg/Gitma.git',
          pushUrl: 'https://github.com/maicondallg/Gitma.git',
        },
        {
          name: 'upstream',
          fetchUrl: 'https://github.com/upstream/Gitma.git',
          pushUrl: 'https://github.com/upstream/Gitma.git',
        },
      ],
    } as RemotesResult)),
    compareCommits: vi.fn(async () => ({
      sessionId: 's1',
      requestId: 1,
      oid: '2222222222222222222222222222222222222222',
      files: [
        {
          id: 'f1',
          name: 'app.ts',
          directory: 'src',
          pathDisplay: 'src/app.ts',
          oldPathDisplay: null,
          status: 'modified' as const,
          area: 'commit' as const,
          insertions: 12,
          deletions: 4,
        },
      ],
      stats: {
        filesChanged: 1,
        insertions: 12,
        deletions: 4,
      },
    })),
  };

  const sampleSnapshot = {
    sessionId: 's1',
    requestId: 1,
    revision: 1,
    historyKey: 'k',
    branch: 'main',
    upstream: 'origin/main',
    headOid: '1111111111111111111111111111111111111111',
    branches: ['main'],
    remotes: ['origin'],
    tags: [],
    stashes: [],
    clean: true,
    conflicted: false,
    files: [],
    staged: [],
    unstaged: [],
    untracked: [],
    stagedStats: { filesChanged: 0, insertions: 0, deletions: 0 },
    unstagedStats: { filesChanged: 0, insertions: 0, deletions: 0 },
    ahead: 3,
    behind: 1,
    operationInProgress: null,
  };

  beforeEach(() => {
    cleanup();
    setLanguage('pt-BR');
    setBridgeAdapter(mockBridge as BridgeAdapter);
    useAppStore.setState({
      session: { sessionId: 's1', root: '/repo', name: 'repo' },
      tabs: [{
        id: 'tab-1',
        name: 'repo',
        path: '/repo',
        session: { sessionId: 's1', root: '/repo', name: 'repo' },
        snapshot: sampleSnapshot,
        history: null,
        context: { kind: 'local' },
        commitFiles: [],
        commitStats: null,
        commitDetails: null,
        selectedFile: null,
        preview: null,
        commitMessage: '',
      }],
      activeTabId: 'tab-1',
      snapshot: sampleSnapshot,
      historyScope: 'all',
      history: {
        sessionId: 's1',
        requestId: 1,
        page: 0,
        laneCount: 1,
        hasMore: false,
        historyKey: 'k',
        rows: [{
          row: 0,
          lane: 0,
          parentLanes: [],
          connections: [],
          activeLanes: [0],
          commit: {
            oid: '1111111111111111111111111111111111111111',
            parents: [],
            refs: ['HEAD -> main'],
            author: 'Developer',
            timestamp: 1700000000,
            subject: 'Initial commit',
          },
        }],
      },
      context: { kind: 'local' },
      selectedFile: null,
      preview: null,
      remotesModalOpen: false,
    });
  });

  describe('RemotesModal', () => {
    it('renderiza remotes existentes com nome e URLs', async () => {
      const onClose = vi.fn();
      render(<RemotesModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(mockBridge.getRemotes).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText('origin')).toBeInTheDocument();
        expect(screen.getByText('upstream')).toBeInTheDocument();
        expect(screen.getByText(/github\.com\/maicondallg\/Gitma\.git/i)).toBeInTheDocument();
        expect(screen.getByText(/github\.com\/upstream\/Gitma\.git/i)).toBeInTheDocument();
      });
    });

    it('permite abrir formulário e adicionar um novo remote', async () => {
      const runOpSpy = vi.fn().mockResolvedValue(undefined);
      useAppStore.setState({ runOperation: runOpSpy });

      render(<RemotesModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('origin')).toBeInTheDocument();
      });

      // Clica em "Adicionar Remote"
      const addBtn = screen.getByRole('button', { name: /Adicionar Remote/i });
      fireEvent.click(addBtn);

      // Preenche nome e url
      const nameInput = screen.getByPlaceholderText(/origin, upstream/i);
      const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/i);

      fireEvent.change(nameInput, { target: { value: 'fork' } });
      fireEvent.change(urlInput, { target: { value: 'https://github.com/fork/Gitma.git' } });

      // Salva
      const saveBtn = screen.getByRole('button', { name: /Salvar/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(runOpSpy).toHaveBeenCalledWith(
          'addRemote',
          [],
          JSON.stringify({ name: 'fork', url: 'https://github.com/fork/Gitma.git' })
        );
      });
    });

    it('permite disparar Fetch & Prune para um remote', async () => {
      const runOpSpy = vi.fn().mockResolvedValue(undefined);
      useAppStore.setState({ runOperation: runOpSpy });

      render(<RemotesModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('origin')).toBeInTheDocument();
      });

      // Clica no botão de Fetch & Prune
      const pruneButtons = screen.getAllByRole('button', { name: /Fetch & Prune/i });
      expect(pruneButtons.length).toBeGreaterThan(0);
      fireEvent.click(pruneButtons[0]);

      await waitFor(() => {
        expect(runOpSpy).toHaveBeenCalledWith('fetchPrune', [], 'origin');
      });
    });
  });

  describe('GraphPanel History Scope & Comparison', () => {
    it('alterna o escopo de histórico entre Todas as branches e Branch atual', async () => {
      const setHistoryScopeSpy = vi.fn();
      useAppStore.setState({ setHistoryScope: setHistoryScopeSpy });

      render(<GraphPanel />);

      const currentBranchBtn = screen.getByRole('button', { name: /Branch atual/i });
      fireEvent.click(currentBranchBtn);
      expect(setHistoryScopeSpy).toHaveBeenCalledWith('current');

      const allBranchesBtn = screen.getByRole('button', { name: /Todas as branches/i });
      fireEvent.click(allBranchesBtn);
      expect(setHistoryScopeSpy).toHaveBeenCalledWith('all');
    });

    it('renderiza labels completos e resumidos (Todas/Atual) para permitir compressão responsiva', () => {
      render(<GraphPanel />);

      const toggleGroup = screen.getByRole('group', { name: /Alternar visualização do grafo/i });
      expect(toggleGroup).toBeInTheDocument();

      // Labels completos
      expect(screen.getByText('Todas as branches')).toHaveClass('lists-scope-label-full');
      expect(screen.getByText('Branch atual')).toHaveClass('lists-scope-label-full');

      // Labels resumidos para quando a coluna é comprimida
      expect(screen.getByText('Todas')).toHaveClass('lists-scope-label-short');
      expect(screen.getByText('Atual')).toHaveClass('lists-scope-label-short');
    });

    it('renderiza o banner de comparação quando no contexto compare', async () => {
      useAppStore.setState({
        context: {
          kind: 'compare',
          baseOid: '1111111111111111111111111111111111111111',
          targetOid: '2222222222222222222222222222222222222222',
        },
      });

      render(<GraphPanel />);

      expect(screen.getByText(/Comparando/i)).toBeInTheDocument();
      expect(screen.getByText('1111111')).toBeInTheDocument();
      expect(screen.getByText('2222222')).toBeInTheDocument();
    });
  });

  describe('DiffPanel Conflict Resolution Banner', () => {
    it('renderiza os botões de resolução quando preview.kind === conflict e dispara resolveConflict', async () => {
      const resolveConflictSpy = vi.fn().mockResolvedValue(undefined);
      useAppStore.setState({
        resolveConflict: resolveConflictSpy,
        selectedFile: {
          id: 'f-conflict',
          name: 'README.md',
          directory: '',
          pathDisplay: 'README.md',
          oldPathDisplay: null,
          status: 'conflicted',
          area: 'unstaged',
          insertions: 3,
          deletions: 1,
        },
        preview: {
          sessionId: 's1',
          requestId: 1,
          fileId: 'f-conflict',
          version: '1',
          kind: 'conflict',
          original: '<<<<<<< HEAD\nMine\n=======\nTheirs\n>>>>>>> branch',
          modified: '<<<<<<< HEAD\nMine\n=======\nTheirs\n>>>>>>> branch',
          message: null,
        },
      });

      render(<DiffPanel />);

      // Banner deve estar presente
      expect(screen.getByText(/Conflito de mesclagem detectado/i)).toBeInTheDocument();

      // Botões de resolução
      const oursBtn = screen.getByRole('button', { name: /Aceitar Atual/i });
      const theirsBtn = screen.getByRole('button', { name: /Aceitar Entrada/i });
      const bothBtn = screen.getByRole('button', { name: /Aceitar Ambos/i });
      const markBtn = screen.getByRole('button', { name: /Marcar como Resolvido/i });

      expect(oursBtn).toBeInTheDocument();
      expect(theirsBtn).toBeInTheDocument();
      expect(bothBtn).toBeInTheDocument();
      expect(markBtn).toBeInTheDocument();

      // Clicar em Aceitar Atual
      fireEvent.click(oursBtn);
      expect(resolveConflictSpy).toHaveBeenCalledWith('README.md', 'ours');

      // Clicar em Aceitar Entrada
      fireEvent.click(theirsBtn);
      expect(resolveConflictSpy).toHaveBeenCalledWith('README.md', 'theirs');

      // Clicar em Marcar como Resolvido
      fireEvent.click(markBtn);
      expect(resolveConflictSpy).toHaveBeenCalledWith('README.md', 'mark_resolved');
    });
  });

  describe('TabBar Ahead / Behind Badges & Remotes Button', () => {
    it('renderiza badges de Ahead (↑3) e Behind (↓1) e dispara push/pull ao clicar', async () => {
      const runOpSpy = vi.fn().mockResolvedValue(undefined);
      useAppStore.setState({ runOperation: runOpSpy });

      render(<TabBar />);

      // Ahead badge
      const aheadBadge = screen.getByRole('button', { name: /3 commit.*à frente/i });
      expect(aheadBadge).toBeInTheDocument();
      expect(aheadBadge).toHaveTextContent('3');

      // Behind badge
      const behindBadge = screen.getByRole('button', { name: /1 commit.*atrás/i });
      expect(behindBadge).toBeInTheDocument();
      expect(behindBadge).toHaveTextContent('1');

      // Clica no ahead badge
      fireEvent.click(aheadBadge);
      expect(runOpSpy).toHaveBeenCalledWith('push');

      // Clica no behind badge
      fireEvent.click(behindBadge);
      expect(runOpSpy).toHaveBeenCalledWith('pull');
    });

    it('abre o modal de remotes ao clicar no botão de globo', async () => {
      const openRemotesSpy = vi.fn();
      useAppStore.setState({ openRemotesModal: openRemotesSpy });

      render(<TabBar />);

      const remotesBtn = screen.getByRole('button', { name: /Repositórios Remotos/i });
      expect(remotesBtn).toBeInTheDocument();

      fireEvent.click(remotesBtn);
      expect(openRemotesSpy).toHaveBeenCalled();
    });
  });
});
