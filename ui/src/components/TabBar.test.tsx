import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabBar } from './TabBar';
import { useAppStore, type AppState } from '../store/app';
import type { TabItem } from '../lib/types';

const actions = {
  switchTab: vi.fn(async () => {}),
  closeTab: vi.fn(async () => {}),
  closeOtherTabs: vi.fn(async () => {}),
  closeTabsToRight: vi.fn(async () => {}),
  reorderTabs: vi.fn(),
  reorderTabsList: vi.fn(),
  setTabName: vi.fn(),
  setTabColor: vi.fn(),
  setGroupName: vi.fn(),
  openHome: vi.fn(),
  openRepository: vi.fn(async () => {}),
  openRepositories: vi.fn(async () => {}),
  cloneRepository: vi.fn(async () => {}),
  initRepository: vi.fn(async () => {}),
  settingsOpen: false,
  openSettings: vi.fn(),
  closeSettings: vi.fn(),
  toggleSettings: vi.fn(),
};

const makeTab = (id: string, name: string, color: string): TabItem => ({
  id,
  path: id,
  name,
  session: { sessionId: `s-${id}`, root: id, name },
  snapshot: {
    sessionId: `s-${id}`,
    requestId: 1,
    revision: 1,
    branch: 'main',
    upstream: null,
    conflicted: false,
    staged: [],
    unstaged: [],
    historyKey: 'h',
  },
  history: null,
  context: { kind: 'local' },
  commitFiles: [],
  selectedFile: null,
  preview: null,
  commitMessage: '',
  color,
});

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    tabs: [
      makeTab('/repo/a', 'Repo A', '#3b82f6'),
      makeTab('/repo/b', 'Repo B', '#10b981'),
    ],
    activeTabId: '/repo/a',
    recentRepos: [],
    session: { sessionId: 's', root: '/repo/a', name: 'Repo A' },
    snapshot: null,
    history: null,
    context: { kind: 'local' },
    commitFiles: [],
    commitStats: null,
    commitDetails: null,
    selectedFile: null,
    preview: null,
    diffMode: 'unified',
    compactDiff: true,
    fileViewMode: 'tree',
    groupNames: {},
    commitMessage: '',
    fileHistoryPath: null,
    reflogOpen: false,
    openFileHistory: vi.fn(),
    closeFileHistory: vi.fn(),
    openReflog: vi.fn(),
    closeReflog: vi.fn(),
    remotesModalOpen: false,
    historyScope: 'all',
    compareOids: null,
    openRemotesModal: vi.fn(),
    closeRemotesModal: vi.fn(),
    setHistoryScope: vi.fn(async () => {}),
    compareCommits: vi.fn(async () => {}),
    resolveConflict: vi.fn(async () => {}),
    blameOpen: false,
    setBlameOpen: vi.fn(),
    pullStrategy: 'ff-only',
    setPullStrategy: vi.fn(),
    mergeStrategy: 'default',
    setMergeStrategy: vi.fn(),
    refreshing: false,
    opening: false,
    operation: null,
    notice: null,
    restoreSavedTabs: vi.fn(async () => {}),
    removeRecentRepo: vi.fn(),
    clearRecentRepos: vi.fn(),
    refresh: vi.fn(async () => {}),
    selectLocal: vi.fn(async () => {}),
    selectCommit: vi.fn(async () => {}),
    selectFile: vi.fn(async () => {}),
    loadMore: vi.fn(async () => {}),
    runOperation: vi.fn(async () => {}),
    preferredTerminal: 'default',
    setPreferredTerminal: vi.fn(),
    openTerminal: vi.fn(async () => {}),
    setCommitMessage: vi.fn(),
    setDiffMode: vi.fn(),
    setCompactDiff: vi.fn(),
    setFileViewMode: vi.fn(),
    activePane: 'history',
    setActivePane: vi.fn(),
    expandedDiff: false,
    setExpandedDiff: vi.fn(),
    dismissNotice: vi.fn(),
    ...actions,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(state());
});

afterEach(() => cleanup());

describe('TabBar component', () => {
  it('renders tabs with color indicators, title, and active states', () => {
    render(<TabBar />);

    expect(screen.getByText('Repo A')).toBeInTheDocument();
    expect(screen.getByText('Repo B')).toBeInTheDocument();

    const tabA = screen.getByText('Repo A').closest('.tab-item')!;
    expect(tabA.classList.contains('active')).toBe(true);
    expect(tabA.querySelector('.tab-color-dot')).toHaveStyle({ backgroundColor: '#3b82f6' });

    const tabB = screen.getByText('Repo B').closest('.tab-item')!;
    expect(tabB.classList.contains('active')).toBe(false);
    expect(tabB.querySelector('.tab-color-dot')).toHaveStyle({ backgroundColor: '#10b981' });
  });

  it('switches tab on click', () => {
    render(<TabBar />);
    fireEvent.click(screen.getByText('Repo B'));
    expect(actions.switchTab).toHaveBeenCalledWith('/repo/b');
  });

  it('closes tab when clicking close button', () => {
    render(<TabBar />);
    const closeBtn = screen.getByRole('button', { name: 'Fechar aba Repo A' });
    fireEvent.click(closeBtn);
    expect(actions.closeTab).toHaveBeenCalledWith('/repo/a');
  });

  it('closes tab on middle-click (button 1)', () => {
    render(<TabBar />);
    const tabB = screen.getByText('Repo B').closest('.tab-item')!;
    fireEvent.mouseDown(tabB, { button: 1 });
    expect(actions.closeTab).toHaveBeenCalledWith('/repo/b');
  });

  it('opens home tab when clicking Inicio button', () => {
    render(<TabBar />);
    fireEvent.click(screen.getByRole('button', { name: /Início|Página inicial/i }));
    expect(actions.openHome).toHaveBeenCalled();
  });

  it('renders long branch names with tab-branch-pill and preserves close button', () => {
    useAppStore.setState(
      state({
        tabs: [
          makeTab('/repo/long', 'Super Long Project Name', '#3b82f6'),
        ],
        activeTabId: '/repo/long',
        snapshot: {
          sessionId: 's-long',
          requestId: 1,
          revision: 1,
          branch: 'feat/probabilidade-taxonomia-muito-longa',
          upstream: null,
          conflicted: false,
          staged: [],
          unstaged: [],
          historyKey: 'h',
        },
      })
    );

    render(<TabBar />);
    const pill = screen.getByTitle('Branch: feat/probabilidade-taxonomia-muito-longa');
    expect(pill).toBeInTheDocument();
    expect(pill.querySelector('.tab-branch-name')).toHaveTextContent('feat/probabilidade-taxonomia-muito-longa');
    expect(screen.getByRole('button', { name: 'Fechar aba Super Long Project Name' })).toBeInTheDocument();
  });

  it('collapses and expands tabs of the same color group', () => {
    useAppStore.setState(
      state({
        tabs: [
          makeTab('/repo/g1', 'Green One', '#10b981'),
          makeTab('/repo/g2', 'Green Two', '#10b981'),
          makeTab('/repo/g3', 'Green Three', '#10b981'),
        ],
        activeTabId: '/repo/g1',
      })
    );

    render(<TabBar />);

    // Todas as 3 abas visíveis inicialmente
    expect(screen.getByText('Green One')).toBeInTheDocument();
    expect(screen.getByText('Green Two')).toBeInTheDocument();
    expect(screen.getByText('Green Three')).toBeInTheDocument();

    // Botão de recolher grupo deve existir
    const collapseBtn = screen.getByLabelText(/Recolher grupo Verde/i);
    expect(collapseBtn).toBeInTheDocument();

    // Clica para recolher o grupo
    fireEvent.click(collapseBtn);

    // Agora as abas estão ocultas e o badge de grupo recolhido aparece
    expect(screen.queryByText('Green Two')).not.toBeInTheDocument();
    const collapsedPill = screen.getByLabelText(/Expandir grupo Verde/i);
    expect(collapsedPill).toBeInTheDocument();
    expect(collapsedPill).toHaveTextContent(/Verde \(3\)/i);

    // Clica no badge recolhido para expandir
    fireEvent.click(collapsedPill);

    // Todas as 3 abas voltam a ficar visíveis
    expect(screen.getByText('Green One')).toBeInTheDocument();
    expect(screen.getByText('Green Two')).toBeInTheDocument();
    expect(screen.getByText('Green Three')).toBeInTheDocument();
  });

  it('exibe nome customizado do grupo e permite renomear', () => {
    const setGroupName = vi.fn();
    useAppStore.setState(
      state({
        tabs: [
          makeTab('/repo/g1', 'Green One', '#10b981'),
          makeTab('/repo/g2', 'Green Two', '#10b981'),
        ],
        activeTabId: '/repo/g1',
        groupNames: {
          '#10b981': 'Microserviços',
        },
        setGroupName,
      })
    );

    render(<TabBar />);

    // Deve exibir o nome customizado do grupo
    const collapseBtn = screen.getByLabelText(/Recolher grupo Microserviços/i);
    expect(collapseBtn).toBeInTheDocument();
    expect(collapseBtn).toHaveTextContent(/Microserviços \(2\)/i);

    // Dois cliques no nome do grupo entra em modo de edição inline
    const nameSpan = collapseBtn.querySelector('.tab-group-chip-name');
    expect(nameSpan).toBeInTheDocument();
    fireEvent.doubleClick(nameSpan!);

    const input = screen.getByRole('textbox', { name: /Nome do grupo/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Microserviços');

    // Altera o nome e pressiona Enter
    fireEvent.change(input, { target: { value: 'Backend Core' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(setGroupName).toHaveBeenCalledWith('#10b981', 'Backend Core');
  });

  it('permite renomear nome da aba com duplo clique', () => {
    const setTabName = vi.fn();
    useAppStore.setState(
      state({
        setTabName,
      })
    );

    render(<TabBar />);

    const tabTitle = screen.getByText('Repo A');
    fireEvent.doubleClick(tabTitle);

    const input = screen.getByRole('textbox', { name: /Nome da aba/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Repo A');

    fireEvent.change(input, { target: { value: 'Frontend Project' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(setTabName).toHaveBeenCalledWith('/repo/a', 'Frontend Project');
  });

  it('permite renomear nome da aba pelo menu de contexto', () => {
    const setTabName = vi.fn();
    useAppStore.setState(
      state({
        setTabName,
      })
    );

    render(<TabBar />);

    const tabTitle = screen.getByText('Repo A');
    fireEvent.contextMenu(tabTitle);

    const renameItem = screen.getByText('Renomear aba');
    expect(renameItem).toBeInTheDocument();
    fireEvent.click(renameItem);

    const input = screen.getByRole('textbox', { name: /Nome da aba/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Repo A');
  });

  it('fecha o menu de contexto da aba ao clicar fora ou com botão direito em outro elemento', () => {
    useAppStore.setState(state());
    render(
      <div>
        <div data-testid="outside-area">Fora</div>
        <TabBar />
      </div>
    );

    const tabTitle = screen.getByText('Repo A');
    fireEvent.contextMenu(tabTitle);
    expect(screen.getByText('Renomear aba')).toBeInTheDocument();

    const outside = screen.getByTestId('outside-area');
    fireEvent.mouseDown(outside);
    expect(screen.queryByText('Renomear aba')).not.toBeInTheDocument();

    fireEvent.contextMenu(tabTitle);
    expect(screen.getByText('Renomear aba')).toBeInTheDocument();

    fireEvent.contextMenu(outside);
    expect(screen.queryByText('Renomear aba')).not.toBeInTheDocument();
  });

  it('permite renomear nome da aba com duplo clique no container da aba', () => {
    const setTabName = vi.fn();
    useAppStore.setState(
      state({
        setTabName,
      })
    );

    render(<TabBar />);

    const tabItem = screen.getByText('Repo B').closest('.tab-item')!;
    fireEvent.doubleClick(tabItem);

    const input = screen.getByRole('textbox', { name: /Nome da aba/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Repo B');

    fireEvent.change(input, { target: { value: 'Backend Service' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(setTabName).toHaveBeenCalledWith('/repo/b', 'Backend Service');
  });

  it('permite renomear grupo com duplo clique no botão do chip', () => {
    const setGroupName = vi.fn();
    useAppStore.setState(
      state({
        tabs: [
          makeTab('/repo/g1', 'Green One', '#10b981'),
          makeTab('/repo/g2', 'Green Two', '#10b981'),
        ],
        activeTabId: '/repo/g1',
        groupNames: {
          '#10b981': 'Microserviços',
        },
        setGroupName,
      })
    );

    render(<TabBar />);

    const collapseBtn = screen.getByLabelText(/Recolher grupo Microserviços/i);
    fireEvent.doubleClick(collapseBtn);

    const input = screen.getByRole('textbox', { name: /Nome do grupo/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Microserviços');

    fireEvent.change(input, { target: { value: 'Novos Serviços' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(setGroupName).toHaveBeenCalledWith('#10b981', 'Novos Serviços');
  });
});

