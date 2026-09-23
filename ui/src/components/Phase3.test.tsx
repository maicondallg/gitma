import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import { useAppStore } from '../store/app';
import { setBridgeAdapter } from '../lib/bridge';
import { setLanguage } from '../i18n';
import { monaco } from '../lib/monaco';
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
        getLineChanges: vi.fn(() => []),
        createViewModel: vi.fn((model) => ({ model, waitForDiff: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() })),
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
          path: 'src/search_wells.py',
          author: 'Alice Dev',
          email: 'alice@example.com',
          timestamp: 1700000000,
          summary: 'Fix query bug in wells API',
        },
        {
          oid: 'def4567890abcdef1234567890abcdef12345678',
          path: 'src/search_wells.py',
          author: 'Bob Engineer',
          email: 'bob@example.com',
          timestamp: 1699900000,
          summary: 'Initial wells controller implementation',
        },
      ],
    } as FileHistoryResult)),
    getFileHistoryPreview: vi.fn(async (_sessionId, requestId, oid, path) => ({
      sessionId: 's1', requestId, fileId: `${oid}:${path}`, version: oid,
      kind: 'text' as const, original: 'before\n', modified: 'after\n', message: null, hunks: [],
    })),
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

      // Selecionar uma revisão atualiza o diff sem sair do histórico.
      fireEvent.click(screen.getByText('Fix query bug in wells API'));
      await waitFor(() => expect(mockBridge.getFileHistoryPreview).toHaveBeenCalledWith(
        's1', expect.any(Number), 'abc1234567890abcdef1234567890abcdef123456', 'src/search_wells.py'
      ));
      expect(selectCommitSpy).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('recolhe e reexibe regiões sem mudanças no diff do histórico', async () => {
      render(<FileHistoryModal filePath="src/search_wells.py" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByLabelText('Diff do arquivo')).toBeInTheDocument());
      const diff = vi.mocked(monaco.editor.createDiffEditor).mock.results.at(-1)?.value;
      expect(within(screen.getByRole('group', { name: 'Layout do diff' }))
        .getAllByRole('button').map((button) => button.textContent)).toEqual([
        'Só alterações', 'Unificado', 'Lado a lado',
      ]);
      const onlyChanges = screen.getByRole('button', { name: 'Só alterações' });
      const modelCount = vi.mocked(monaco.editor.createModel).mock.calls.length;

      fireEvent.click(onlyChanges);
      expect(onlyChanges).toHaveAttribute('aria-pressed', 'true');
      expect(diff.updateOptions).toHaveBeenCalledWith(expect.objectContaining({
        hideUnchangedRegions: { enabled: true, minimumLineCount: 3, contextLineCount: 3 },
      }));

      fireEvent.click(onlyChanges);
      expect(onlyChanges).toHaveAttribute('aria-pressed', 'false');
      expect(diff.updateOptions).toHaveBeenCalledWith(expect.objectContaining({
        hideUnchangedRegions: { enabled: false, minimumLineCount: 3, contextLineCount: 3 },
      }));
      expect(vi.mocked(monaco.editor.createModel).mock.calls.length).toBe(modelCount);
    });

    it('reutiliza o conteúdo ao voltar a uma revisão já aberta', async () => {
      vi.mocked(mockBridge.getFileHistoryPreview!).mockClear();
      render(<FileHistoryModal filePath="src/search_wells.py" onClose={vi.fn()} />);
      await waitFor(() => expect(vi.mocked(mockBridge.getFileHistoryPreview!).mock.calls.length).toBe(1));
      fireEvent.click(screen.getByText('Initial wells controller implementation'));
      await waitFor(() => expect(vi.mocked(mockBridge.getFileHistoryPreview!).mock.calls.length).toBe(2));
      fireEvent.click(screen.getByText('Fix query bug in wells API'));
      expect(vi.mocked(mockBridge.getFileHistoryPreview!).mock.calls.length).toBe(2);
    });

    it('seleciona a revisão ao clicar no espaço vazio do card sem interceptar o hash', async () => {
      render(<FileHistoryModal filePath="src/search_wells.py" onClose={vi.fn()} />);
      const secondCard = (await screen.findByText('Initial wells controller implementation'))
        .closest('.file-history-item') as HTMLElement;
      fireEvent.click(secondCard.querySelector('.file-history-item-actions')!);
      await waitFor(() => expect(mockBridge.getFileHistoryPreview).toHaveBeenCalledWith(
        's1', expect.any(Number), 'def4567890abcdef1234567890abcdef12345678', 'src/search_wells.py'
      ));
      expect(within(secondCard).getByTitle('Ver alterações desta versão')).toHaveAttribute('aria-pressed', 'true');

      const firstCard = screen.getByText('Fix query bug in wells API').closest('.file-history-item') as HTMLElement;
      fireEvent.click(within(firstCard).getByTitle('Copiar hash completo'));
      expect(within(secondCard).getByTitle('Ver alterações desta versão')).toHaveAttribute('aria-pressed', 'true');
    });

    it('só revela o arquivo compacto depois de calcular e recolher o diff', async () => {
      const { container } = render(<FileHistoryModal filePath="src/search_wells.py" onClose={vi.fn()} />);
      const host = await screen.findByLabelText('Diff do arquivo');
      const diff = vi.mocked(monaco.editor.createDiffEditor).mock.results.at(-1)?.value;
      const originalEditor = diff.getOriginalEditor();
      const modifiedEditor = diff.getModifiedEditor();
      let finishDiff!: () => void;
      const diffReady = new Promise<void>((resolve) => { finishDiff = resolve; });
      let changesPublished = false;
      let regionsFolded = false;
      let hiddenListener: () => void = () => undefined;
      let diffListener: () => void = () => undefined;

      vi.mocked(diff.getOriginalEditor).mockReturnValue(originalEditor);
      vi.mocked(diff.getModifiedEditor).mockReturnValue(modifiedEditor);
      vi.mocked(diff.createViewModel).mockImplementationOnce((model: Parameters<monaco.editor.IStandaloneDiffEditor['createViewModel']>[0]) => ({
        model,
        waitForDiff: vi.fn(() => diffReady),
        unchangedRegions: { get: vi.fn(() => [{}]) },
        dispose: vi.fn(),
      } as unknown as monaco.editor.IDiffEditorViewModel));
      vi.mocked(diff.getLineChanges).mockImplementation(() => changesPublished ? [{ modifiedStartLineNumber: 2 }] as never : null);
      vi.mocked(originalEditor._getViewModel).mockImplementation(() => ({ getHiddenAreas: () => regionsFolded ? [{}] : [] }));
      vi.mocked(modifiedEditor._getViewModel).mockImplementation(() => ({ getHiddenAreas: () => regionsFolded ? [{}] : [] }));
      vi.mocked(originalEditor.onDidChangeHiddenAreas).mockImplementation((listener: () => void) => {
        hiddenListener = listener;
        return { dispose: vi.fn() };
      });
      vi.mocked(diff.onDidUpdateDiff).mockImplementation((listener: () => void) => {
        diffListener = listener;
        return { dispose: vi.fn() };
      });

      fireEvent.click(screen.getByRole('button', { name: 'Só alterações' }));
      expect(host.style.visibility).toBe('hidden');
      expect(container.querySelector('.file-history-diff-preparing')).toBeInTheDocument();
      expect(vi.mocked(diff.setModel).mock.lastCall?.[0]).toBeNull();

      await act(async () => { finishDiff(); await diffReady; });
      expect(host.style.visibility).toBe('hidden');
      changesPublished = true;
      act(() => diffListener());
      expect(host.style.visibility).toBe('hidden');
      regionsFolded = true;
      act(() => hiddenListener());
      await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
      expect(host.style.visibility).toBe('');
      expect(container.querySelector('.file-history-diff-preparing')).not.toBeInTheDocument();
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
