import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DiffPanel } from './DiffPanel';
import { useAppStore } from '../store/app';
import { setLanguage } from '../i18n';

const { monacoMock } = vi.hoisted(() => {
  const mock = {
    editor: {
      createDiffEditor: vi.fn(() => ({
        setModel: vi.fn(),
        updateOptions: vi.fn(),
        dispose: vi.fn(),
        onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
        getModifiedEditor: vi.fn(() => ({
          getDomNode: vi.fn(() => null),
          getModel: vi.fn(() => null),
          onDidChangeModel: vi.fn(() => ({ dispose: vi.fn() })),
          onDidChangeHiddenAreas: vi.fn(() => ({ dispose: vi.fn() })),
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
