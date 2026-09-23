import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { DiffPanel } from './DiffPanel';
import { useAppStore } from '../store/app';
import { setLanguage } from '../i18n';

const { monacoMock } = vi.hoisted(() => {
  const mock = {
    editor: {
      createDiffEditor: vi.fn(() => ({
        setModel: vi.fn(),
        getLineChanges: vi.fn(() => []),
        createViewModel: vi.fn((model) => ({ model, waitForDiff: vi.fn().mockResolvedValue(undefined) })),
        updateOptions: vi.fn(),
        dispose: vi.fn(),
        onDidUpdateDiff: vi.fn((_listener?: () => void) => ({ dispose: vi.fn() })),
        getOriginalEditor: vi.fn(() => ({
          render: vi.fn(),
          _getViewModel: vi.fn(() => ({ getHiddenAreas: vi.fn<() => unknown[]>(() => []) })),
          onDidChangeHiddenAreas: vi.fn((_listener?: () => void) => ({ dispose: vi.fn() })),
        })),
        getModifiedEditor: vi.fn(() => ({
          render: vi.fn(),
          getDomNode: vi.fn(() => null),
          getModel: vi.fn(() => null),
          onDidChangeModel: vi.fn(() => ({ dispose: vi.fn() })),
          onDidChangeHiddenAreas: vi.fn((_listener?: () => void) => ({ dispose: vi.fn() })),
          _getViewModel: vi.fn(() => ({ getHiddenAreas: vi.fn<() => unknown[]>(() => []) })),
          onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
          revealLineInCenter: vi.fn(),
          setPosition: vi.fn(),
          focus: vi.fn(),
          getVisibleRanges: vi.fn(() => [{ startLineNumber: 1, endLineNumber: 2 }]),
          getTopForLineNumber: vi.fn((line: number) => line * 20),
          getScrollTop: vi.fn(() => 0),
          getOption: vi.fn(() => 20),
          onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
          onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
        })),
      })),
      createModel: vi.fn(() => ({
        getLineCount: vi.fn(() => 2),
        dispose: vi.fn(),
      })),
      setTheme: vi.fn(),
      EditorOption: {
        lineHeight: 67,
      },
    },
  };
  return { monacoMock: mock };
});

vi.mock('../lib/monaco', () => ({
  default: monacoMock,
  monaco: monacoMock,
  languageForPath: vi.fn(() => 'python'),
}));

vi.mock('../lib/bridge', () => ({
  getBridge: vi.fn(() => ({
    getBlame: vi.fn().mockResolvedValue({
      lines: [
        {
          lineNumber: 1,
          commitOid: 'abcdef123456',
          author: 'Alice',
          authorMail: 'alice@test.com',
          authorTimestamp: 1700000000,
          summary: 'feat: add first line',
        },
        {
          lineNumber: 2,
          commitOid: 'bcdefa234567',
          author: 'Bob',
          authorMail: 'bob@test.com',
          authorTimestamp: 1700000100,
          summary: 'feat: add second line',
        },
      ],
    }),
  })),
}));

describe('DiffPanel header e botões de ação', () => {
  beforeEach(() => {
    cleanup();
    setLanguage('pt-BR');
    useAppStore.setState({
      selectedFile: {
        id: 'f1',
        name: 'search_wells.py',
        directory: 'src/radiar/doc_classification/api/docs/wells',
        pathDisplay: 'src/radiar/doc_classification/api/docs/wells/search_wells.py',
        oldPathDisplay: null,
        status: 'modified',
        area: 'commit',
      },
      preview: null,
      diffMode: 'unified',
      compactDiff: false,
      expandedDiff: false,
    });
  });

  it('renderiza o path dentro de bdo dir="ltr" para truncamento à esquerda', () => {
    const { container } = render(<DiffPanel />);
    const pathLabel = container.querySelector('.path-label');
    expect(pathLabel).toBeInTheDocument();
    expect(pathLabel).toHaveAttribute('title', 'src/radiar/doc_classification/api/docs/wells/search_wells.py');

    const bdo = pathLabel?.querySelector('bdo');
    expect(bdo).toBeInTheDocument();
    expect(bdo).toHaveAttribute('dir', 'ltr');
    expect(bdo?.textContent).toBe('src/radiar/doc_classification/api/docs/wells/search_wells.py');
  });

  it('renderiza os botões "Só alterações", "Unificado" e "Lado a lado" com labels em linha única', () => {
    render(<DiffPanel />);

    const compactBtn = screen.getByRole('button', { name: /Só alterações/i });
    const unifiedBtn = screen.getByRole('button', { name: /Unificado/i });
    const splitBtn = screen.getByRole('button', { name: /Lado a lado/i });

    expect(compactBtn).toBeInTheDocument();
    expect(unifiedBtn).toBeInTheDocument();
    expect(splitBtn).toBeInTheDocument();

    // Alterna compactDiff ao clicar em "Só alterações"
    fireEvent.click(compactBtn);
    expect(useAppStore.getState().compactDiff).toBe(true);

    // Alterna diffMode ao clicar em "Lado a lado"
    fireEvent.click(splitBtn);
    expect(useAppStore.getState().diffMode).toBe('split');
  });

  it('reutiliza os modelos de texto ao alternar só alterações', async () => {
    useAppStore.setState({ preview: {
      sessionId: 's1', requestId: 1, fileId: 'f1', version: 'v1', kind: 'text',
      original: 'before\n', modified: 'after\n', message: null,
    } });
    const createModel = monacoMock.editor.createModel;
    const before = createModel.mock.calls.length;
    render(<DiffPanel />);
    expect(createModel.mock.calls.length - before).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: /Só alterações/i }));
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: /Só alterações/i }));

    expect(createModel.mock.calls.length - before).toBe(2);
  });

  it('aguarda o diff antes de exibir um arquivo no modo compacto', async () => {
    let finishDiff!: () => void;
    let changesPublished = false;
    let regionsFolded = false;
    let diffListener: () => void = () => undefined;
    let originalHiddenListener: () => void = () => undefined;
    let modifiedHiddenListener: () => void = () => undefined;
    const diffReady = new Promise<void>((resolve) => { finishDiff = resolve; });
    const createDiffEditor = monacoMock.editor.createDiffEditor.getMockImplementation()!;
    monacoMock.editor.createDiffEditor.mockImplementationOnce(() => {
      const instance = createDiffEditor();
      instance.createViewModel.mockImplementationOnce((model) => ({
        model,
        waitForDiff: vi.fn(() => diffReady),
        unchangedRegions: { get: vi.fn(() => [{}]) },
      }));
      instance.getLineChanges.mockImplementation(() => changesPublished ? [{ modifiedStartLineNumber: 176 }] as never : null as never);
      instance.onDidUpdateDiff.mockImplementation((listener?: () => void) => {
        if (listener) diffListener = listener;
        return { dispose: vi.fn() };
      });
      const originalEditor = instance.getOriginalEditor();
      const modifiedEditor = instance.getModifiedEditor();
      originalEditor._getViewModel.mockImplementation(() => ({ getHiddenAreas: vi.fn(() => regionsFolded ? [{}] : []) }));
      modifiedEditor._getViewModel.mockImplementation(() => ({ getHiddenAreas: vi.fn(() => regionsFolded ? [{}] : []) }));
      originalEditor.onDidChangeHiddenAreas.mockImplementation((listener?: () => void) => {
        if (listener) originalHiddenListener = listener;
        return { dispose: vi.fn() };
      });
      modifiedEditor.onDidChangeHiddenAreas.mockImplementation((listener?: () => void) => {
        if (listener) modifiedHiddenListener = listener;
        return { dispose: vi.fn() };
      });
      instance.getOriginalEditor.mockReturnValue(originalEditor);
      instance.getModifiedEditor.mockReturnValue(modifiedEditor);
      return instance;
    });
    const createModel = monacoMock.editor.createModel.getMockImplementation()!;
    monacoMock.editor.createModel.mockImplementationOnce(() => ({ ...createModel(), getLineCount: vi.fn(() => 326) }));
    monacoMock.editor.createModel.mockImplementationOnce(() => ({ ...createModel(), getLineCount: vi.fn(() => 326) }));
    useAppStore.setState({
      compactDiff: true,
      preview: {
        sessionId: 's1', requestId: 1, fileId: 'f1', version: 'v1', kind: 'text',
        original: 'before\n', modified: 'after\n', message: null,
        hunks: [],
      },
    });
    const { container } = render(<DiffPanel />);
    const host = container.querySelector('.monaco-host') as HTMLElement;
    expect(host.style.visibility).toBe('hidden');
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => {
      finishDiff();
      await diffReady;
    });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    expect(host.style.visibility).toBe('hidden');

    changesPublished = true;
    act(() => diffListener());
    expect(host.style.visibility).toBe('hidden');

    regionsFolded = true;
    act(() => { originalHiddenListener(); modifiedHiddenListener(); });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(host.style.visibility).toBe('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('mantém o diff compacto anterior visível enquanto calcula o próximo', async () => {
    const firstFile = useAppStore.getState().selectedFile!;
    const firstPreview = {
      sessionId: 's1', requestId: 1, fileId: firstFile.id, version: 'v1', kind: 'text' as const,
      original: 'before\n', modified: 'after\n', message: null,
    };
    useAppStore.setState({ compactDiff: true, preview: firstPreview });
    const { container } = render(<DiffPanel />);
    await act(async () => { await Promise.resolve(); });
    const host = container.querySelector('.monaco-host') as HTMLElement;
    const diff = monacoMock.editor.createDiffEditor.mock.results.at(-1)!.value;
    const activeModel = diff.setModel.mock.lastCall?.[0];
    expect(activeModel).toBeTruthy();
    expect(host.style.visibility).toBe('');

    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    diff.createViewModel.mockImplementationOnce((model: unknown) => ({
      model, waitForDiff: () => pending, unchangedRegions: { get: () => [] }, dispose: vi.fn(),
    }));
    const secondFile = { ...firstFile, id: 'f2', name: 'next.py', pathDisplay: 'src/next.py' };
    act(() => useAppStore.setState({
      selectedFile: secondFile,
      preview: { ...firstPreview, fileId: secondFile.id, version: 'v2', modified: 'next\n' },
    }));

    expect(diff.setModel.mock.lastCall?.[0]).toBe(activeModel);
    expect(host.style.visibility).toBe('');
    expect(container.querySelector('.path-label')).toHaveTextContent(firstFile.pathDisplay);

    await act(async () => { finish(); await pending; });
    expect(diff.setModel.mock.lastCall?.[0]).not.toBe(activeModel);
    expect(host.style.visibility).toBe('');
    expect(container.querySelector('.path-label')).toHaveTextContent(secondFile.pathDisplay);
  });

  it('renderiza barra de hunks e permite navegar e preparar trecho', () => {
    const runOperationMock = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      selectedFile: {
        id: 'f1',
        name: 'test.rs',
        directory: 'src',
        pathDisplay: 'src/test.rs',
        oldPathDisplay: null,
        status: 'modified',
        area: 'unstaged',
      },
      preview: {
        sessionId: 's1',
        requestId: 1,
        fileId: 'f1',
        version: 'v1',
        kind: 'text',
        original: 'fn a() {}\n',
        modified: 'fn a() {}\nfn b() {}\n',
        message: null,
        hunks: [
          {
            id: 'hunk-0',
            header: '@@ -1,1 +1,2 @@',
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 2,
            patch: 'diff --git a/src/test.rs b/src/test.rs\n--- a/src/test.rs\n+++ b/src/test.rs\n@@ -1,1 +1,2 @@\n fn a() {}\n+fn b() {}\n',
          },
        ],
      },
      runOperation: runOperationMock,
    });

    render(<DiffPanel />);

    // Deve exibir o badge Bloco 1 de 1
    expect(screen.getByText(/Bloco 1 de 1/i)).toBeInTheDocument();

    // Deve exibir o intervalo legível de linhas
    expect(screen.getByText(/Linhas 1–2/i)).toBeInTheDocument();

    // Deve renderizar o botão de preparar bloco
    const stageHunkBtn = screen.getByRole('button', { name: /Preparar bloco/i });
    expect(stageHunkBtn).toBeInTheDocument();

    fireEvent.click(stageHunkBtn);
    expect(runOperationMock).toHaveBeenCalledWith('stageHunk', [], expect.stringContaining('fn b()'));
  });

  it('exibe o escopo/função do bloco quando presente no cabeçalho diff', () => {
    useAppStore.setState({
      selectedFile: {
        id: 'f1',
        name: 'test.rs',
        directory: 'src',
        pathDisplay: 'src/test.rs',
        oldPathDisplay: null,
        status: 'modified',
        area: 'unstaged',
      },
      preview: {
        sessionId: 's1',
        requestId: 2,
        fileId: 'f1',
        version: 'v2',
        kind: 'text',
        original: 'fn main() {}\n',
        modified: 'fn main() {\n  println!("test");\n}\n',
        message: null,
        hunks: [
          {
            id: 'hunk-0',
            header: '@@ -10,3 +10,4 @@ fn calculate_metrics()',
            oldStart: 10,
            oldLines: 3,
            newStart: 10,
            newLines: 4,
            patch: 'diff --git a/test.rs b/test.rs\n@@ -10,3 +10,4 @@\n',
          },
        ],
      },
    });

    render(<DiffPanel />);

    expect(screen.getByText(/Linhas 10–13/i)).toBeInTheDocument();
    expect(screen.getByText(/fn calculate_metrics\(\)/i)).toBeInTheDocument();
  });

  it('sincroniza blame lines com coordenadas absolutas de Monaco', async () => {
    useAppStore.setState({
      session: { sessionId: 's1', name: 'repo', root: '/test' },
      blameOpen: true,
      selectedFile: {
        id: 'f1',
        name: 'test.rs',
        directory: 'src',
        pathDisplay: 'src/test.rs',
        oldPathDisplay: null,
        status: 'modified',
        area: 'unstaged',
      },
      preview: {
        sessionId: 's1',
        requestId: 1,
        fileId: 'f1',
        version: 'v1',
        kind: 'text',
        original: 'line 1\nline 2\n',
        modified: 'line 1\nline 2\n',
        message: null,
      },
    });

    render(<DiffPanel />);

    const authorAlice = await screen.findByText('Alice');
    expect(authorAlice).toBeInTheDocument();

    const row = authorAlice.closest('.diff-blame-row') as HTMLElement;
    expect(row).toBeInTheDocument();
    expect(row.style.position).toBe('absolute');
    expect(row.style.top).toBe('20px');
  });
});
