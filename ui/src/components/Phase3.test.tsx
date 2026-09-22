import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useAppStore } from '../store/app';
import { setBridgeAdapter } from '../lib/bridge';
import { setLanguage } from '../i18n';
import { FilesPanel } from './FilesPanel';
import { DiffPanel } from './DiffPanel';
import { FileHistoryModal } from './FileHistoryModal';
import { ReflogModal } from './ReflogModal';
import type { BridgeAdapter } from '../lib/bridge';
import type { FileHistoryResult, ReflogResult, BlameResult } from '../lib/types';

vi.mock('../lib/monaco', () => ({
  monaco: {
    editor: {
      createDiffEditor: vi.fn(() => ({
        setModel: vi.fn(),
        updateOptions: vi.fn(),
        dispose: vi.fn(),
        getModifiedEditor: vi.fn(() => ({
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
        dispose: vi.fn(),
      })),
      setTheme: vi.fn(),
    },
  },
  languageForPath: vi.fn(() => 'python'),
}));

describe('Phase 3 Features', () => {
  const mockBridge: Partial<BridgeAdapter> = {
    openRepository: vi.fn(),
    closeRepository: vi.fn(),
    getSnapshot: vi.fn(),
    getHistory: vi.fn(),
    getCommitFiles: vi.fn(),
    getFilePreview: vi.fn(),
    applyOperation: vi.fn(),
    onRepoChanged: vi.fn(async () => () => undefined),
    getFileHistory: vi.fn(async () => ({
      entries: [
        {
          oid: 'abc1234567890abcdef1234567890abcdef123456',
          author: 'Alice Dev',
          email: 'alice@example.com',
          timestamp: 1700000000,
          summary: 'Fix query bug in wells API',
        },
        {
          oid: 'def4567890abcdef1234567890abcdef12345678',
          author: 'Bob Engineer',
          email: 'bob@example.com',
          timestamp: 1699900000,
          summary: 'Initial wells controller implementation',
        },
      ],
    } as FileHistoryResult)),
    getReflog: vi.fn(async () => ({
      entries: [
        {
          oid: 'abc1234567890abcdef1234567890abcdef123456',
          selector: 'HEAD@{0}',
          action: 'commit: Fix query bug in wells API',
          timestamp: 1700000000,
          author: 'Alice Dev',
        },
        {
          oid: 'def4567890abcdef1234567890abcdef12345678',
          selector: 'HEAD@{1}',
          action: 'checkout: moving from main to feature-wells',
          timestamp: 1699900000,
          author: 'Bob Engineer',
        },
      ],
    } as ReflogResult)),
    getBlame: vi.fn(async () => ({
      lines: [
        {
          lineNumber: 1,
          commitOid: 'abc1234567890abcdef1234567890abcdef123456',
          author: 'Alice Dev',
          authorMail: 'alice@example.com',
          authorTimestamp: 1700000000,
          summary: 'Fix query bug in wells API',
        },
        {
          lineNumber: 2,
          commitOid: '0000000000000000000000000000000000000000',
          author: 'Not Committed Yet',
          authorMail: 'not.committed.yet',
          authorTimestamp: 0,
          summary: 'Not Committed Yet',
        },
      ],
    } as BlameResult)),
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
        snapshot: null,
        history: null,
        context: { kind: 'commit', oid: 'abc1234567890abcdef1234567890abcdef123456' },
        commitFiles: [],
        commitStats: null,
        commitDetails: null,
        selectedFile: null,
        preview: null,
        commitMessage: '',
      }],
      activeTabId: 'tab-1',
      context: { kind: 'commit', oid: 'abc1234567890abcdef1234567890abcdef123456' },
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
            oid: 'abc1234567890abcdef1234567890abcdef123456',
            parents: ['def4567890abcdef1234567890abcdef12345678'],
            refs: ['HEAD -> main'],
            author: 'Alice Dev',
            timestamp: 1700000000,
            subject: 'Fix query bug in wells API',
          },
        }],
      },
      commitFiles: [
        {
          id: 'f1',
          name: 'search_wells.py',
          directory: 'src',
          pathDisplay: 'src/search_wells.py',
          oldPathDisplay: null,
          status: 'modified',
          area: 'commit',
          insertions: 5,
          deletions: 2,
        },
      ],
      commitDetails: {
        oid: 'abc1234567890abcdef1234567890abcdef123456',
        parents: ['def4567890abcdef1234567890abcdef12345678'],
        refs: ['HEAD -> main'],
        authorName: 'Alice Dev',
        authorEmail: 'alice@example.com',
        authorTimestamp: 1700000000,
        committerName: 'GitHub Web',
        committerEmail: 'noreply@github.com',
        committerTimestamp: 1700000050,
        subject: 'Fix query bug in wells API',
        body: 'Detailed explanation of why this bug happened.\nResolves issue #42.',
      },
      selectedFile: {
        id: 'f1',
        name: 'search_wells.py',
        directory: 'src',
        pathDisplay: 'src/search_wells.py',
        oldPathDisplay: null,
        status: 'modified',
        area: 'commit',
        insertions: 5,
        deletions: 2,
      },
      preview: {
        sessionId: 's1',
        requestId: 1,
        fileId: 'f1',
        version: '1',
        kind: 'text',
        original: 'old content',
        modified: 'new content',
        message: null,
      },
      reflogOpen: false,
      fileHistoryPath: null,
    });
  });

  describe('Commit Details in FilesPanel', () => {
    it('renderiza pais clicáveis, committer distinto e corpo multiline do commit', async () => {
      const selectCommitSpy = vi.fn();
      useAppStore.setState({ selectCommit: selectCommitSpy });

      render(<FilesPanel />);

      // Verifica committer distinto
      expect(screen.getByText(/GitHub Web/i)).toBeInTheDocument();

      // Verifica corpo multiline
      expect(screen.getByText(/Detailed explanation of why this bug happened/i)).toBeInTheDocument();

      // Verifica badge de parent hash
      const parentBadge = screen.getByRole('button', { name: /def4567/i });
      expect(parentBadge).toBeInTheDocument();

      // Clicar no parent deve disparar selectCommit
      fireEvent.click(parentBadge);
      expect(selectCommitSpy).toHaveBeenCalledWith('def4567890abcdef1234567890abcdef12345678');
    });
  });

  describe('Git Blame Visualizer in DiffPanel', () => {
    it('alterna visualização de Git Blame e renderiza linhas com commit e não comitado', async () => {
      const selectCommitSpy = vi.fn();
      useAppStore.setState({ selectCommit: selectCommitSpy });

      render(<DiffPanel />);

      const blameBtn = screen.getByRole('button', { name: /Git Blame/i });
      expect(blameBtn).toBeInTheDocument();

      // Ativa Git Blame
      fireEvent.click(blameBtn);

      await waitFor(() => {
        expect(mockBridge.getBlame).toHaveBeenCalled();
      });

      // Linha 1: Alice Dev
      await waitFor(() => {
        expect(screen.getByText('Alice Dev')).toBeInTheDocument();
      });
      expect(screen.getByText('abc1234')).toBeInTheDocument();

      // Linha 2: Não submetido
      expect(screen.getByText(/Não submetido/i)).toBeInTheDocument();

      // Clicar na linha de commit seleciona o commit
      const authorElem = screen.getByText('Alice Dev');
      fireEvent.click(authorElem);
      expect(selectCommitSpy).toHaveBeenCalledWith('abc1234567890abcdef1234567890abcdef123456');
    });
  });

  describe('FileHistoryModal', () => {
    it('carrega revisões do arquivo, permite filtrar e selecionar commit', async () => {
      const onClose = vi.fn();
      const selectCommitSpy = vi.fn();
      useAppStore.setState({ selectCommit: selectCommitSpy });

      render(<FileHistoryModal filePath="src/search_wells.py" onClose={onClose} />);

      await waitFor(() => {
        expect(mockBridge.getFileHistory).toHaveBeenCalled();
      });

      // Ambas revisões presentes
      await waitFor(() => {
        expect(screen.getByText('Fix query bug in wells API')).toBeInTheDocument();
        expect(screen.getByText('Initial wells controller implementation')).toBeInTheDocument();
      });

      // Filtra por "query"
      const searchInput = screen.getByPlaceholderText(/Filtrar por mensagem/i);
      fireEvent.change(searchInput, { target: { value: 'query' } });

      expect(screen.getByText('Fix query bug in wells API')).toBeInTheDocument();
      expect(screen.queryByText('Initial wells controller implementation')).not.toBeInTheDocument();

      // Clica na revisão para selecionar
      fireEvent.click(screen.getByText('Fix query bug in wells API'));
      expect(selectCommitSpy).toHaveBeenCalledWith('abc1234567890abcdef1234567890abcdef123456');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('ReflogModal', () => {
    it('carrega registros do reflog, permite filtrar e visualizar commit no grafo', async () => {
      const onClose = vi.fn();
      const selectCommitSpy = vi.fn();
      useAppStore.setState({ selectCommit: selectCommitSpy });

      render(<ReflogModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(mockBridge.getReflog).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText('HEAD@{0}')).toBeInTheDocument();
        expect(screen.getByText('HEAD@{1}')).toBeInTheDocument();
        expect(screen.getByText(/commit: Fix query bug in wells API/i)).toBeInTheDocument();
        expect(screen.getByText(/checkout: moving from main to feature-wells/i)).toBeInTheDocument();
      });

      // Filtra por "checkout"
      const searchInput = screen.getByPlaceholderText(/Filtrar por seletor/i);
      fireEvent.change(searchInput, { target: { value: 'checkout' } });

      expect(screen.queryByText(/commit: Fix query bug in wells API/i)).not.toBeInTheDocument();
      expect(screen.getByText(/checkout: moving from main to feature-wells/i)).toBeInTheDocument();

      // Clica no botão de visualizar no grafo
      const viewButtons = screen.getAllByTitle('Visualizar commit no grafo');
      expect(viewButtons.length).toBeGreaterThan(0);
      fireEvent.click(viewButtons[0]);

      expect(selectCommitSpy).toHaveBeenCalledWith('def4567890abcdef1234567890abcdef12345678');
      expect(onClose).toHaveBeenCalled();
    });
  });
});
