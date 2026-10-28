import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize() })),
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

import { FileExplorer } from './FileExplorer';
import { FilesPanel } from './FilesPanel';
import { useAppStore, type AppState } from '../store/app';
import { setBridgeAdapter, type BridgeAdapter } from '../lib/bridge';
import type { FileEntry } from '../lib/types';
import { setLanguage } from '../i18n';

describe('FileExplorer component', () => {
  const mockRepoFiles = [
    { path: 'src/main.rs', size: 1024, isDirectory: false },
    { path: 'src/components/Button.tsx', size: 2048, isDirectory: false },
    { path: 'README.md', size: 512, isDirectory: false },
  ];

  const mockBridge: Partial<BridgeAdapter> = {
    getRepoFiles: vi.fn().mockResolvedValue({
      sessionId: 'test-session',
      requestId: 1,
      commitOid: null,
      files: mockRepoFiles,
    }),
  };

  beforeEach(() => {
    setLanguage('pt-BR');
    setBridgeAdapter(mockBridge as BridgeAdapter);

    useAppStore.setState({
      session: { sessionId: 'test-session', root: '/repo', name: 'repo' },
      context: { kind: 'local' },
      snapshot: {
        sessionId: 'test-session',
        requestId: 1,
        revision: 1,
        branch: 'main',
        upstream: null,
        conflicted: false,
        staged: [],
        unstaged: [],
        historyKey: 'h',
      },
      activePane: 'files',
      fileViewMode: 'flat',
      filesTab: 'explorer',
      selectedFile: null,
      preview: null,
    } as unknown as AppState);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads and displays repository files in flat view', async () => {
    render(<FileExplorer />);

    await waitFor(() => {
      expect(mockBridge.getRepoFiles).toHaveBeenCalledWith('test-session', expect.any(Number), null);
    });

    expect(await screen.findByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('Button.tsx')).toBeInTheDocument();
    expect(screen.getByText('main.rs')).toBeInTheDocument();
    expect(screen.getByText('3 arquivos')).toBeInTheDocument();
  });

  it('filters files based on search input', async () => {
    render(<FileExplorer />);

    await screen.findByText('README.md');

    const searchInput = screen.getByPlaceholderText('Buscar arquivo por nome ou caminho...');
    fireEvent.change(searchInput, { target: { value: 'Button' } });

    expect(screen.getByText('Button.tsx')).toBeInTheDocument();
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();
    expect(screen.queryByText('main.rs')).not.toBeInTheDocument();
    expect(screen.getByText('1 de 3 arquivos')).toBeInTheDocument();
  });

  it('selects file and triggers selectFile when clicked', async () => {
    const selectFile = vi.fn();
    useAppStore.setState({ selectFile } as unknown as Partial<AppState>);

    render(<FileExplorer />);

    const fileBtn = await screen.findByText('README.md');
    fireEvent.click(fileBtn);

    expect(selectFile).toHaveBeenCalledWith(
      expect.objectContaining({
        pathDisplay: 'README.md',
        area: 'repo',
      })
    );
  });

  it('triggers view history and open in editor actions', async () => {
    const openFileHistory = vi.fn();
    const runOperation = vi.fn();
    useAppStore.setState({ openFileHistory, runOperation } as unknown as Partial<AppState>);

    render(<FileExplorer />);

    await screen.findByText('README.md');

    const historyButtons = screen.getAllByTitle('Ver histórico');
    expect(historyButtons.length).toBeGreaterThan(0);
    fireEvent.click(historyButtons[0]);
    expect(openFileHistory).toHaveBeenCalled();

    const editorButtons = screen.getAllByTitle('Abrir no editor');
    expect(editorButtons.length).toBeGreaterThan(0);
    fireEvent.click(editorButtons[0]);
    expect(runOperation).toHaveBeenCalledWith('openEditor', [], expect.any(String));
  });

  it('switches between Alterações and Explorador tabs in FilesPanel', async () => {
    useAppStore.setState({
      filesTab: 'changes',
      snapshot: {
        sessionId: 'test-session',
        requestId: 1,
        revision: 1,
        branch: 'main',
        upstream: null,
        conflicted: false,
        staged: [],
        unstaged: [
          {
            id: 'u1',
            name: 'modified.ts',
            directory: 'src',
            pathDisplay: 'src/modified.ts',
            oldPathDisplay: null,
            status: 'modified',
            area: 'unstaged',
          },
        ],
        historyKey: 'h',
      },
    } as unknown as Partial<AppState>);

    render(<FilesPanel />);

    // In 'changes' tab, modified.ts is visible
    expect(screen.getByText('modified.ts')).toBeInTheDocument();

    // Click 'Explorador' tab
    const explorerTab = screen.getByRole('tab', { name: /Explorador/i });
    fireEvent.click(explorerTab);

    // After switching, getRepoFiles is called and repo files are displayed
    await waitFor(() => {
      expect(screen.getByText('Button.tsx')).toBeInTheDocument();
    });
  });

  it('navigates files with arrow keys in FileExplorer', async () => {
    const selectFile = vi.fn();
    useAppStore.setState({
      activePane: 'files',
      filesTab: 'explorer',
      selectFile,
      selectedFile: null,
    } as unknown as Partial<AppState>);

    render(<FileExplorer />);
    await screen.findByText('README.md');

    // Arrow down selects the first file
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(selectFile).toHaveBeenCalledWith(
        expect.objectContaining({ pathDisplay: 'src/main.rs' })
      );
    });
  });

  it('moves continuously between files when holding arrow keys in FileExplorer', async () => {
    const selectFile = vi.fn(async (selected: FileEntry) => {
      useAppStore.setState({ selectedFile: selected });
    });
    useAppStore.setState({
      activePane: 'files',
      filesTab: 'explorer',
      selectFile,
      selectedFile: null,
    } as unknown as Partial<AppState>);

    render(<FileExplorer />);
    await screen.findByText('README.md');

    // First keydown: repeat false (selects first file, index 0: src/main.rs)
    fireEvent.keyDown(window, { key: 'ArrowDown', repeat: false });
    await act(async () => { await Promise.resolve(); });

    expect(useAppStore.getState().selectedFile?.pathDisplay).toBe('src/main.rs');

    // Second keydown: repeat true (selects second file, index 1: src/components/Button.tsx)
    fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true });
    await act(async () => { await Promise.resolve(); });

    expect(useAppStore.getState().selectedFile?.pathDisplay).toBe('src/components/Button.tsx');
    expect(selectFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathDisplay: 'src/components/Button.tsx' }),
      { deferPreview: true }
    );

    // Third keydown: repeat true (selects third file, index 2: README.md)
    fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true });
    await act(async () => { await Promise.resolve(); });

    expect(useAppStore.getState().selectedFile?.pathDisplay).toBe('README.md');

    // Releasing the key (keyUp) flushes preview for the current file
    fireEvent.keyUp(window, { key: 'ArrowDown' });
    expect(selectFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathDisplay: 'README.md' })
    );
  });

  it('navigates only between files in tree view without selecting directories', async () => {
    const selectFile = vi.fn();
    useAppStore.setState({
      activePane: 'files',
      filesTab: 'explorer',
      fileViewMode: 'tree',
      selectFile,
      selectedFile: null,
    } as unknown as Partial<AppState>);

    render(<FileExplorer />);
    await screen.findByText('README.md');

    // Arrow down in tree mode selects the first visible file, never a folder node
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(selectFile).toHaveBeenCalledWith(
        expect.objectContaining({
          area: 'repo',
        })
      );
    });
    // Ensure what was selected is a file, not a directory
    const selected = selectFile.mock.calls[0][0];
    expect(selected.pathDisplay).toMatch(/\.(md|tsx|rs)$/);
  });

  it('navigates back to history pane when pressing ArrowLeft in explorer', async () => {
    const setActivePane = vi.fn();
    useAppStore.setState({
      activePane: 'files',
      filesTab: 'explorer',
      fileViewMode: 'tree',
      setActivePane,
      selectedFile: null,
    } as unknown as Partial<AppState>);

    render(<FileExplorer />);
    await screen.findByText('README.md');

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(setActivePane).toHaveBeenCalledWith('history');
  });

  it('renders editor section in SettingsModal and changes preferred editor', async () => {
    const setPreferredEditor = vi.fn();
    useAppStore.setState({
      preferredEditor: 'default',
      setPreferredEditor,
    } as unknown as Partial<AppState>);

    const { SettingsModal } = await import('./SettingsModal');
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    // Click 'Editor de Código' nav item
    const editorNavBtn = screen.getByRole('button', { name: /Editor de Código/i });
    fireEvent.click(editorNavBtn);

    // Verify presets are rendered
    expect(screen.getByText('Cursor')).toBeInTheDocument();
    expect(screen.getByText('Zed')).toBeInTheDocument();
    expect(screen.getByText('Visual Studio Code')).toBeInTheDocument();

    // Select Cursor
    fireEvent.click(screen.getByText('Cursor'));
    expect(setPreferredEditor).toHaveBeenCalledWith('cursor');
  });

  it('focuses search input on Ctrl+F and handles Escape and ArrowDown keys in search', async () => {
    const selectFile = vi.fn();
    useAppStore.setState({
      activePane: 'files',
      filesTab: 'explorer',
      selectFile,
      selectedFile: null,
    } as unknown as Partial<AppState>);

    render(<FileExplorer />);
    const searchInput = await screen.findByPlaceholderText('Buscar arquivo por nome ou caminho...');

    // Ctrl+F focuses search input
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(document.activeElement).toBe(searchInput);

    // Typing in search input
    fireEvent.change(searchInput, { target: { value: 'Button' } });
    expect(searchInput).toHaveValue('Button');

    // Escape clears filter when non-empty
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).toHaveValue('');

    // ArrowDown from search input blurs and selects first file
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(selectFile).toHaveBeenCalledWith(
      expect.objectContaining({ pathDisplay: 'src/main.rs' })
    );
  });

  it('prefetches adjacent files when file preview is active', async () => {
    const prefetchFile = vi.fn();
    useAppStore.setState({
      activePane: 'files',
      filesTab: 'explorer',
      prefetchFile,
      selectedFile: {
        id: 'repo:src/components/Button.tsx',
        name: 'Button.tsx',
        directory: 'src/components',
        pathDisplay: 'src/components/Button.tsx',
        oldPathDisplay: null,
        status: 'untracked',
        area: 'repo',
      },
      preview: {
        sessionId: 'test-session',
        requestId: 1,
        fileId: 'repo:src/components/Button.tsx',
        path: 'src/components/Button.tsx',
        status: 'untracked',
        content: null,
        patch: null,
        isBinary: false,
        isTruncated: false,
        size: 2048,
        leftOid: null,
        rightOid: null,
      },
    } as unknown as Partial<AppState>);

    render(<FileExplorer />);
    await screen.findByText('Button.tsx');

    // prefetchFile should be called for adjacent files
    await waitFor(() => {
      expect(prefetchFile).toHaveBeenCalled();
    });
  });
});

