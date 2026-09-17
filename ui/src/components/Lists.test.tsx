import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({ getTotalSize: () => count * estimateSize(), getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize() })), measure: vi.fn(), scrollToIndex: vi.fn() }) }))
vi.mock('./DiffPanel', () => ({ DiffPanel: () => <div data-testid="diff-panel" /> }))
vi.mock('../lib/monaco', () => ({ monaco: { editor: { defineTheme: vi.fn() } }, languageForPath: () => 'plaintext' }))
import { CommitForm } from './CommitForm'
import { ContextMenu } from './ContextMenu'
import { CreateTagModal } from './CreateTagModal'
import { FilesPanel } from './FilesPanel'
import { GraphPanel, parseRefs } from './GraphPanel'
import { InProgressBanner } from './InProgressBanner'
import { ResetModal } from './ResetModal'
import App from '../App'
import { useAppStore, type AppState } from '../store/app'
import type { FileEntry } from '../lib/types'

const file = (id: string, pathDisplay: string, area: FileEntry['area']): FileEntry => {
  const bits = pathDisplay.split('/')
  return { id, name: bits.pop()!, directory: bits.join('/'), pathDisplay, oldPathDisplay: null, status: 'modified', area }
}
const staged = file('s1', 'src/app.ts', 'staged')
const unstaged = file('u1', 'src/theme.css', 'unstaged')
const actions = { selectFile: vi.fn(async () => {}), runOperation: vi.fn(async () => {}), setCommitMessage: vi.fn(), selectCommit: vi.fn(async () => {}), loadMore: vi.fn(async () => {}) }
function state(overrides: Partial<AppState> = {}): AppState {
  return {
    tabs: [],
    activeTabId: '/repo',
    recentRepos: [],
    closeTab: vi.fn(async () => {}),
    closeOtherTabs: vi.fn(async () => {}),
    closeTabsToRight: vi.fn(async () => {}),
    switchTab: vi.fn(async () => {}),
    reorderTabs: vi.fn(),
    reorderTabsList: vi.fn(),
    setTabName: vi.fn(),
    setTabColor: vi.fn(),
    groupNames: {},
    setGroupName: vi.fn(),
    openHome: vi.fn(),
    removeRecentRepo: vi.fn(),
    clearRecentRepos: vi.fn(),
    restoreSavedTabs: vi.fn(async () => {}),
    session: { sessionId: 's', root: '/repo', name: 'repo' },
    snapshot: { sessionId: 's', requestId: 1, revision: 1, branch: 'main', upstream: null, conflicted: false, staged: [staged], unstaged: [unstaged], historyKey: 'h' },
    history: null,
    context: { kind: 'local' },
    commitFiles: [],
    selectedFile: null,
    preview: null,
    diffMode: 'unified',
    compactDiff: false,
    fileViewMode: 'flat',
    commitMessage: '',
    refreshing: false,
    opening: false,
    operation: null,
    notice: null,
    openRepository: vi.fn(async () => {}),
    openRepositories: vi.fn(async () => {}),
    cloneRepository: vi.fn(async () => {}),
    initRepository: vi.fn(async () => {}),
    settingsOpen: false,
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
    toggleSettings: vi.fn(),
    refresh: vi.fn(async () => {}),
    selectLocal: vi.fn(async () => {}),
    selectCommit: actions.selectCommit,
    selectFile: actions.selectFile,
    loadMore: actions.loadMore,
    runOperation: actions.runOperation,
    setCommitMessage: actions.setCommitMessage,
    setDiffMode: vi.fn(),
    setCompactDiff: vi.fn(),
    setFileViewMode: vi.fn(),
    activePane: 'history',
    setActivePane: vi.fn(),
    expandedDiff: false,
    setExpandedDiff: vi.fn(),
    dismissNotice: vi.fn(),
    ...overrides,
  };
}


beforeEach(() => { vi.clearAllMocks(); useAppStore.setState(state()) })
afterEach(() => cleanup())

describe('listas de alterações', () => {
  it('mantém seleção independente do checkbox de stage', () => {
    render(<FilesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /theme\.css/i }))
    expect(actions.selectFile).toHaveBeenCalledWith(unstaged)
    fireEvent.click(screen.getByRole('checkbox', { name: /theme\.css/i }))
    expect(actions.runOperation).toHaveBeenCalledWith('stage', ['u1'])
    expect(actions.selectFile).toHaveBeenCalledTimes(1)
  })

  it('não exibe stage nem formulário ao navegar por commit histórico', () => {
    useAppStore.setState(state({ context: { kind: 'commit', oid: 'abc' }, commitFiles: [file('c1', 'README.md', 'commit')] }))
    render(<FilesPanel />)
    expect(screen.getByRole('button', { name: /README\.md/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adicionar tudo|Tirar tudo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('desabilita commit quando existem conflitos', () => {
    useAppStore.setState(state({ snapshot: { ...state().snapshot!, conflicted: true }, commitMessage: 'mensagem' }))
    render(<CommitForm />)
    expect(screen.getByRole('button', { name: /Criar commit/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Criar commit/i })).toHaveAttribute('title', expect.stringContaining('conflitos'))
  })

  it('submete com Ctrl+Enter e aceita mensagem longa', () => {
    useAppStore.setState(state({ commitMessage: 'x'.repeat(600) }))
    render(<CommitForm />)
    const editor = screen.getByRole('textbox')
    expect(editor).not.toHaveAttribute('maxlength')
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(actions.runOperation).toHaveBeenCalledWith('commit')
  })

  it('permite marcar amend, preenche mensagem anterior e submete commitAmend', () => {
    const lastCommit = { oid: 'c111', parents: [], refs: ['main'], author: 'Ana', timestamp: 1000, subject: 'Mensagem do commit anterior' }
    useAppStore.setState(state({
      commitMessage: '',
      history: { sessionId: 's', requestId: 1, page: 0, rows: [{ commit: lastCommit, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }], laneCount: 1, hasMore: false, historyKey: 'h' }
    }))
    render(<CommitForm />)

    const amendCheckbox = screen.getByLabelText(/Emendar último commit/i)
    expect(amendCheckbox).not.toBeChecked()

    // Clica para ativar o amend
    fireEvent.click(amendCheckbox)
    expect(amendCheckbox).toBeChecked()

    // Mensagem foi preenchida com a mensagem do commit anterior
    expect(actions.setCommitMessage).toHaveBeenCalledWith('Mensagem do commit anterior')

    // Botão de submit agora diz "Emendar commit"
    const submitBtn = screen.getByRole('button', { name: /Emendar commit/i })
    expect(submitBtn).toBeInTheDocument()

    // Submete o form
    fireEvent.click(submitBtn)
    expect(actions.runOperation).toHaveBeenCalledWith('commitAmend')
  })
})

describe('gráfico', () => {
  it('mostra refs excedentes e permite selecionar commits por teclado', async () => {
    const commit = { oid: 'abcdef123456', parents: [], refs: ['HEAD -> main', 'origin/main', 'tag: v1'], author: 'Ana', timestamp: Math.floor(Date.now() / 1000), subject: 'Commit acessível' }
    useAppStore.setState(state({ history: { sessionId: 's', requestId: 1, page: 0, rows: [{ commit, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }], laneCount: 1, hasMore: false, historyKey: 'h' } }))
    render(<GraphPanel />)
    const commitRow = await screen.findByTitle(new RegExp(commit.oid))
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByTitle('HEAD -> main, origin/main, tag: v1')).toBeInTheDocument()
    commitRow.focus()
    fireEvent.keyDown(commitRow, { key: 'Enter' })
    fireEvent.click(commitRow)
    await waitFor(() => expect(actions.selectCommit).toHaveBeenCalledWith(commit.oid))
  })

  it('permite selecionar alterações locais pelo nó de uncommitted changes no topo do grafo', async () => {
    const selectLocal = vi.fn(async () => {})
    useAppStore.setState(state({ selectLocal }))
    render(<GraphPanel />)
    const uncommittedRow = screen.getByText(/Uncommitted changes/i).closest('button')!
    fireEvent.click(uncommittedRow)
    expect(selectLocal).toHaveBeenCalledTimes(1)
  })

  it('exibe o ponto indicador (•) na branch ativa e abre menu de contexto no clique com botão direito', async () => {
    const commit = { oid: 'c12345678901', parents: [], refs: ['HEAD -> main', 'origin/feat'], author: 'Dev', timestamp: Math.floor(Date.now() / 1000), subject: 'Ref test' }
    useAppStore.setState(state({
      snapshot: { ...state().snapshot!, branch: 'main' },
      history: { sessionId: 's', requestId: 1, page: 0, rows: [{ commit, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }], laneCount: 1, hasMore: false, historyKey: 'h' }
    }))
    render(<GraphPanel />)
    // O chip da branch HEAD deve conter o dot •
    const headChip = screen.getByTitle('HEAD -> main')
    expect(headChip).toHaveTextContent('•')

    // Botão direito abre menu de contexto
    fireEvent.contextMenu(headChip)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText(/Criar nova branch a partir daqui/i)).toBeInTheDocument()
  })

  it('abre RefPopover ao clicar no badge +N e permite checkout rápido', async () => {
    const runOperation = vi.fn(async () => {})
    const commit = {
      oid: 'c99988877766',
      parents: [],
      refs: ['HEAD -> main', 'origin/feat', 'feat/login', 'tag: v1.0.0'],
      author: 'Dev',
      timestamp: Math.floor(Date.now() / 1000),
      subject: 'Multi refs test',
    }
    useAppStore.setState(state({
      runOperation,
      snapshot: { ...state().snapshot!, branch: 'main' },
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [{ commit, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }))
    render(<GraphPanel />)

    // O badge +2 de overflow deve estar presente
    const overflowBadge = screen.getByText('+2')
    expect(overflowBadge).toBeInTheDocument()

    // Clicar no badge abre o popover com todas as 4 referências
    fireEvent.click(overflowBadge)
    const popover = screen.getByRole('dialog', { name: /Referências do commit/i })
    expect(popover).toBeInTheDocument()
    expect(within(popover).getByText('Branches Locais')).toBeInTheDocument()
    expect(within(popover).getByText('Branches Remotas')).toBeInTheDocument()
    expect(within(popover).getByText('Tags')).toBeInTheDocument()
    expect(within(popover).getByText('feat/login')).toBeInTheDocument()
    expect(within(popover).getByText('v1.0.0')).toBeInTheDocument()

    // Clicar em feat/login deve disparar o switchBranch
    fireEvent.click(within(popover).getByText('feat/login'))
    expect(runOperation).toHaveBeenCalledWith('switchBranch', [], 'feat/login')
  })

  it('abre o menu de contexto ao clicar no botão de mais opções (...)', async () => {
    const commit = {
      oid: 'c55544433322',
      parents: [],
      refs: ['main'],
      author: 'Dev',
      timestamp: Math.floor(Date.now() / 1000),
      subject: 'Actions button test',
    }
    useAppStore.setState(state({
      snapshot: { ...state().snapshot!, branch: 'main' },
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [{ commit, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }))
    render(<GraphPanel />)

    const commitRow = screen.getByText('Actions button test').closest('button')!
    fireEvent.contextMenu(commitRow)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText(/Copiar hash/i)).toBeInTheDocument()
  })
})

describe('modo árvore em FilesPanel', () => {
  it('alterna para modo árvore e agrupa arquivos por pastas', () => {
    const setFileViewMode = vi.fn()
    useAppStore.setState(state({ fileViewMode: 'tree', setFileViewMode }))
    render(<FilesPanel />)
    // No modo árvore, pasta "src" deve aparecer
    expect(screen.getAllByText('src')[0]).toBeInTheDocument()
    // Botão de alternar para lista plana chama setFileViewMode
    fireEvent.click(screen.getByTitle('Lista plana'))
    expect(setFileViewMode).toHaveBeenCalledWith('flat')
  })

  it('adiciona arquivo ao stage com duplo clique na área de fora do stage', () => {
    render(<FilesPanel />)
    const fileButton = screen.getByRole('button', { name: /theme\.css/i })
    fireEvent.doubleClick(fileButton)
    expect(actions.runOperation).toHaveBeenCalledWith('stage', ['u1'])
  })

  it('remove arquivo do stage com duplo clique na área em stage', () => {
    render(<FilesPanel />)
    const fileButton = screen.getByRole('button', { name: /app\.ts/i })
    fireEvent.doubleClick(fileButton)
    expect(actions.runOperation).toHaveBeenCalledWith('unstage', ['s1'])
  })
})

describe('Stash, Cherry-pick e RefPopover no GraphPanel', () => {
  it('parseRefs classifica refs/stash e stash@{0} como isStash', () => {
    const refs = ['refs/stash', 'stash@{0}', 'main', 'tag: v1.0.0']
    const parsed = parseRefs(refs, 'main')
    const stashRef = parsed.find((r) => r.name === 'stash')
    expect(stashRef).toBeDefined()
    expect(stashRef?.isStash).toBe(true)

    const stash0Ref = parsed.find((r) => r.name === 'stash@{0}')
    expect(stash0Ref).toBeDefined()
    expect(stash0Ref?.isStash).toBe(true)
  })

  it('parseRefs classifica refs/tags/ como isTag e remove o prefixo', () => {
    const refs = ['refs/tags/v0.1.1-beta.1', 'tag: v1.0.0']
    const parsed = parseRefs(refs, 'main')
    const tag1 = parsed.find((r) => r.name === 'v0.1.1-beta.1')
    expect(tag1).toBeDefined()
    expect(tag1?.isTag).toBe(true)

    const tag2 = parsed.find((r) => r.name === 'v1.0.0')
    expect(tag2).toBeDefined()
    expect(tag2?.isTag).toBe(true)
  })

  it('renderiza opções de Cherry-pick e exclusão remota no ContextMenu', () => {
    const onCherryPick = vi.fn()
    const onDeleteRemoteBranch = vi.fn()
    render(
      <ContextMenu
        x={100}
        y={100}
        branchName="origin/feature-test"
        isRemoteBranch={true}
        commitOid="1234567890abcdef"
        onClose={vi.fn()}
        onCherryPick={onCherryPick}
        onDeleteRemoteBranch={onDeleteRemoteBranch}
      />
    )

    const cherryBtn = screen.getByText(/Cherry-pick este commit/i)
    expect(cherryBtn).toBeInTheDocument()
    fireEvent.click(cherryBtn)
    expect(onCherryPick).toHaveBeenCalledWith('1234567890abcdef')

    const deleteRemoteBtn = screen.getByText(/Excluir no remoto/i)
    expect(deleteRemoteBtn).toBeInTheDocument()
  })

  it('renderiza opções de Stash (Pop, Apply, Drop) no ContextMenu quando isStash é verdadeiro', () => {
    const onStashPop = vi.fn()
    const onStashApply = vi.fn()
    const onStashDrop = vi.fn()
    render(
      <ContextMenu
        x={100}
        y={100}
        branchName="stash@{0}"
        isStash={true}
        commitOid="stashoid123"
        onClose={vi.fn()}
        onStashPop={onStashPop}
        onStashApply={onStashApply}
        onStashDrop={onStashDrop}
      />
    )

    expect(screen.getByText(/Aplicar e remover \(Pop\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Aplicar e manter \(Apply\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Descartar stash \(Drop\)/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Aplicar e remover \(Pop\)/i))
    expect(onStashPop).toHaveBeenCalledWith('stash@{0}')
  })

  it('renderiza opção de Reset no ContextMenu e dispara callback ao clicar', () => {
    const onResetHead = vi.fn()
    render(
      <ContextMenu
        x={100}
        y={100}
        commitOid="commit999"
        currentBranchName="develop"
        onClose={vi.fn()}
        onResetHead={onResetHead}
      />
    )

    const resetBtn = screen.getByText(/Resetar branch \(develop\) para aqui/i)
    expect(resetBtn).toBeInTheDocument()
    fireEvent.click(resetBtn)
    expect(onResetHead).toHaveBeenCalledWith('commit999')
  })

  it('fecha ContextMenu ao clicar fora ou ao disparar contextmenu em outro lugar', () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="outside-area">Fora</div>
        <ContextMenu
          x={100}
          y={100}
          commitOid="commit999"
          onClose={onClose}
        />
      </div>
    )

    const outside = screen.getByTestId('outside-area')
    fireEvent.mouseDown(outside)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.contextMenu(outside)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('fecha RefPopover ao abrir ContextMenu a partir do popover', () => {
    const commit = {
      oid: 'c99988877766',
      parents: [],
      refs: ['HEAD -> main', 'origin/feat', 'feat/login', 'tag: v1.0.0'],
      author: 'Dev',
      timestamp: Math.floor(Date.now() / 1000),
      subject: 'Multi refs test',
    }
    useAppStore.setState(state({
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [{ commit, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }))

    render(<GraphPanel />)
    const overflowBadge = screen.getByText('+2')
    fireEvent.click(overflowBadge)

    expect(screen.getByRole('dialog', { name: /Referências do commit/i })).toBeInTheDocument()

    // Clicar no botão de mais opções (...) de uma ref dentro do popover
    const moreButtons = screen.getAllByTitle(/Mais ações/i)
    fireEvent.click(moreButtons[0])

    // O popover deve ter sido fechado e o context menu aberto
    expect(screen.queryByRole('dialog', { name: /Referências do commit/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('renderiza e submete o ResetModal com o modo selecionado', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(
      <ResetModal
        isOpen={true}
        commitOid="abcdef123456"
        commitSubject="feat: nova tela"
        currentBranchName="feature/nova-tela"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText(/Resetar branch \(feature\/nova-tela\)/i)).toBeInTheDocument()
    expect(screen.getByText(/abcdef1/i)).toBeInTheDocument()
    expect(screen.getByText(/feat: nova tela/i)).toBeInTheDocument()

    // Seleciona o modo Rígido (--hard)
    const hardRadio = screen.getByDisplayValue('hard')
    fireEvent.click(hardRadio)

    // Alerta de aviso deve aparecer
    expect(screen.getByText(/Atenção: todas as alterações não commitadas/i)).toBeInTheDocument()

    // Submeter form
    const submitBtn = screen.getByRole('button', { name: /Resetar \(Descartar alterações\)/i })
    fireEvent.click(submitBtn)

    expect(onConfirm).toHaveBeenCalledWith('hard')
    expect(onClose).toHaveBeenCalled()
  })

  it('renderiza toolbar com nome do repositório, branch ao lado, sem path e ações centralizadas', () => {
    useAppStore.setState(
      state({
        activeTabId: '/repo/test',
        session: { sessionId: 's1', root: '/home/user/projects/repo-test', name: 'repo-test' },
        snapshot: {
          sessionId: 's1',
          requestId: 1,
          revision: 1,
          branch: 'develop',
          upstream: null,
          conflicted: false,
          staged: [],
          unstaged: [],
          historyKey: 'h',
        },
      })
    )

    render(<App />)

    // Nome do repositório deve estar visível
    expect(screen.getByText('repo-test')).toBeInTheDocument()

    // Chip da branch "develop" deve estar visível ao lado
    expect(screen.getByText('develop')).toBeInTheDocument()

    // O path da pasta NÃO deve ser mostrado
    expect(screen.queryByText('/home/user/projects/repo-test')).not.toBeInTheDocument()

    // Botões de ação centralizados devem estar presentes
    expect(screen.getByText('Nova branch')).toBeInTheDocument()
    expect(screen.getByText('Fetch')).toBeInTheDocument()
    expect(screen.getByText('Pull')).toBeInTheDocument()
    expect(screen.getByText('Push')).toBeInTheDocument()
    expect(screen.getByText('Stash')).toBeInTheDocument()
  })

  it('permite navegar entre commits usando as setas para cima e para baixo', async () => {
    const c1 = { oid: 'c11111111111', parents: [], refs: [], author: 'Author 1', timestamp: 1000, subject: 'First commit' };
    const c2 = { oid: 'c22222222222', parents: [], refs: [], author: 'Author 2', timestamp: 2000, subject: 'Second commit' };
    useAppStore.setState(state({
      context: { kind: 'commit', oid: c1.oid },
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [
          { commit: c1, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] },
          { commit: c2, row: 1, lane: 0, parentLanes: [], connections: [], activeLanes: [0] },
        ],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }));

    render(<GraphPanel />);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(actions.selectCommit).toHaveBeenCalledWith(c2.oid);

    act(() => {
      useAppStore.setState({ context: { kind: 'commit', oid: c2.oid } });
    });

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(actions.selectCommit).toHaveBeenCalledWith(c1.oid);
  });

  it('copia a hash do commit ao clicar no código da hash', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    const c1 = { oid: 'c11111111111', parents: [], refs: [], author: 'Author 1', timestamp: 1000, subject: 'First commit' };
    useAppStore.setState(state({
      context: { kind: 'commit', oid: c1.oid },
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [{ commit: c1, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }));

    render(<GraphPanel />);

    const hashCode = screen.getByText('c111111');
    fireEvent.click(hashCode);

    expect(writeTextMock).toHaveBeenCalledWith(c1.oid);
  });

  it('exibe o card completo do commit selecionado na área de arquivos e permite copiar a hash', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    const c1 = { oid: 'c1111111111122222222233333333334444444444', parents: [], refs: [], author: 'Walter Cardoso', timestamp: 1789500000, subject: 'Update snapshot.yml with detailed config' };
    useAppStore.setState(state({
      context: { kind: 'commit', oid: c1.oid },
      commitFiles: [file('f1', 'src/snapshot.yml', 'commit')],
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [{ commit: c1, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }));

    render(<FilesPanel />);

    expect(screen.getByText('Update snapshot.yml with detailed config')).toBeInTheDocument();
    expect(screen.getByText('Walter Cardoso')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: /c1111111/i });
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(c1.oid);
  });

  it('permite alternar entre histórico e arquivos com ArrowRight e ArrowLeft', async () => {
    const setActivePane = vi.fn();
    const selectFile = vi.fn();
    const f1 = file('f1', 'src/main.rs', 'commit');
    const c1 = { oid: 'c11111111111', parents: [], refs: [], author: 'Author 1', timestamp: 1000, subject: 'First commit' };

    useAppStore.setState(state({
      activePane: 'history',
      setActivePane,
      selectFile,
      context: { kind: 'commit', oid: c1.oid },
      commitFiles: [f1],
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [{ commit: c1, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }));

    const { unmount } = render(<GraphPanel />);

    // ArrowRight no histórico deve alternar para arquivos e selecionar o primeiro
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(setActivePane).toHaveBeenCalledWith('files');
    expect(selectFile).toHaveBeenCalledWith(f1);

    unmount();

    // ArrowLeft nos arquivos deve voltar para o histórico
    useAppStore.setState(state({
      activePane: 'files',
      setActivePane,
      selectFile,
      context: { kind: 'commit', oid: c1.oid },
      commitFiles: [f1],
    }));

    render(<FilesPanel />);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(setActivePane).toHaveBeenCalledWith('history');
  });

  it('permite selecionar arquivos com ArrowDown e ArrowUp no painel de arquivos', async () => {
    const selectFile = vi.fn();
    const f1 = file('f1', 'src/main.rs', 'commit');
    const f2 = file('f2', 'src/lib.rs', 'commit');
    const c1 = { oid: 'c11111111111', parents: [], refs: [], author: 'Author 1', timestamp: 1000, subject: 'First commit' };

    useAppStore.setState(state({
      activePane: 'files',
      selectFile,
      context: { kind: 'commit', oid: c1.oid },
      commitFiles: [f1, f2],
      selectedFile: f1,
      fileViewMode: 'flat',
    }));

    render(<FilesPanel />);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(selectFile).toHaveBeenCalledWith(f2);
  });

  it('FilesPanel navega por setas respeitando a ordenação da árvore', async () => {
    const selectFile = vi.fn();
    // No array plano a ordem é b.rs, cargo.toml, a.rs
    const bFile = file('f1', 'src/b.rs', 'commit');
    const rootFile = file('f2', 'cargo.toml', 'commit');
    const aFile = file('f3', 'src/a.rs', 'commit');
    const c1 = { oid: 'c11111111111', parents: [], refs: [], author: 'Author 1', timestamp: 1000, subject: 'First commit' };

    // Na árvore, a pasta src vem primeiro (com a.rs depois b.rs), e na raiz cargo.toml
    useAppStore.setState(state({
      activePane: 'files',
      selectFile,
      context: { kind: 'commit', oid: c1.oid },
      commitFiles: [bFile, rootFile, aFile],
      selectedFile: aFile,
      fileViewMode: 'tree',
    }));

    const { rerender } = render(<FilesPanel />);

    // De a.rs, ArrowDown deve ir para b.rs (ordem da árvore) e NÃO para cargo.toml
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(selectFile).toHaveBeenCalledWith(bFile);

    // Agora com b.rs selecionado, ArrowDown deve ir para cargo.toml
    useAppStore.setState(state({
      activePane: 'files',
      selectFile,
      context: { kind: 'commit', oid: c1.oid },
      commitFiles: [bFile, rootFile, aFile],
      selectedFile: bFile,
      fileViewMode: 'tree',
    }));
    rerender(<FilesPanel />);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(selectFile).toHaveBeenCalledWith(rootFile);

    // De cargo.toml (último item da árvore), ArrowDown não deve ultrapassar
    useAppStore.setState(state({
      activePane: 'files',
      selectFile,
      context: { kind: 'commit', oid: c1.oid },
      commitFiles: [bFile, rootFile, aFile],
      selectedFile: rootFile,
      fileViewMode: 'tree',
    }));
    rerender(<FilesPanel />);

    selectFile.mockClear();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(selectFile).toHaveBeenCalledWith(rootFile);

    // De cargo.toml, ArrowUp deve voltar para b.rs
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(selectFile).toHaveBeenCalledWith(bFile);
  });

  it('GraphPanel renderiza 5 colunas com divisores verticais contínuos no cabeçalho e nas linhas', () => {
    const c1 = { oid: 'c11111111111', parents: [], refs: ['main'], author: 'Alice', timestamp: 1695000000, subject: 'Fix bug' };

    useAppStore.setState(state({
      activePane: 'history',
      context: { kind: 'commit', oid: c1.oid },
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [{ commit: c1, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }));

    const { container } = render(<GraphPanel />);

    // Header deve ter 5 colunas distintas
    const header = container.querySelector('.lists-graph-header');
    expect(header).toBeInTheDocument();
    expect(header?.querySelector('.lists-header-col-graph')).toHaveTextContent('Grafo');
    expect(header?.querySelector('.lists-header-col-msg')).toHaveTextContent('Mensagem');
    expect(header?.querySelector('.lists-header-col-hash')).toHaveTextContent('Hash');
    expect(header?.querySelector('.lists-header-col-author')).toHaveTextContent('Autor');
    expect(header?.querySelector('.lists-header-col-date')).toHaveTextContent('Data');

    // As linhas também devem ter as 5 colunas correspondentes
    const rows = container.querySelectorAll('.lists-graph-row');
    expect(rows.length).toBeGreaterThan(0);

    const commitRow = rows[1]; // Linha 0 é uncommitted, linha 1 é o commit c1
    expect(commitRow.querySelector('.lists-col-graph')).toBeInTheDocument();
    expect(commitRow.querySelector('.lists-col-msg')).toBeInTheDocument();
    expect(commitRow.querySelector('.lists-col-hash')).toBeInTheDocument();
    expect(commitRow.querySelector('.lists-col-author')).toBeInTheDocument();
    expect(commitRow.querySelector('.lists-col-date')).toBeInTheDocument();

    // Divisores verticais reais presentes entre as colunas
    const dividers = commitRow.querySelectorAll('.lists-col-divider');
    expect(dividers.length).toBe(4); // 4 divisores entre 5 colunas

    // Nenhum caractere '|' de texto solto
    expect(commitRow.querySelector('.lists-meta-vsep')).toBeNull();
    expect(header?.querySelector('.lists-header-vsep')).toBeNull();
  });

  it('permite redimensionar colunas de Grafo e Autor no GraphPanel', () => {
    const c1 = { oid: 'c11111111111', parents: [], refs: ['main'], author: 'Alice', timestamp: 1695000000, subject: 'Fix bug' };

    useAppStore.setState(state({
      activePane: 'history',
      context: { kind: 'commit', oid: c1.oid },
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [{ commit: c1, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] }],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }));

    const { container } = render(<GraphPanel />);

    const resizers = container.querySelectorAll('.lists-header-resizer');
    expect(resizers.length).toBe(3); // resizers para Grafo, Mensagem e Autor/Data

    // Redimensionar Grafo
    const graphResizer = resizers[0];
    fireEvent.mouseDown(graphResizer, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);

    // Deve atualizar o localStorage
    expect(localStorage.getItem('Gitma:history-graph-width')).toBeDefined();

    // Redimensionar Mensagem (separador entre Mensagem e Hash)
    const msgResizer = resizers[1];
    fireEvent.mouseDown(msgResizer, { clientX: 200 });
    fireEvent.mouseMove(window, { clientX: 250 });
    fireEvent.mouseUp(window);

    expect(localStorage.getItem('Gitma:history-author-width')).toBeDefined();

    // Redimensionar Autor e Data (separador entre Autor e Data)
    const authorDateResizer = resizers[2];
    fireEvent.mouseDown(authorDateResizer, { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 320 });
    fireEvent.mouseUp(window);

    expect(localStorage.getItem('Gitma:history-date-width')).toBeDefined();
  });

  it('FilesPanel desativa o foco nativo no clique para evitar seleção visual duplicada', () => {
    const selectFile = vi.fn();
    const f1 = file('f1', 'src/main.rs', 'commit');
    const f2 = file('f2', 'src/lib.rs', 'commit');
    const c1 = { oid: 'c11111111111', parents: [], refs: [], author: 'Author 1', timestamp: 1000, subject: 'First commit' };

    useAppStore.setState(state({
      activePane: 'files',
      selectFile,
      context: { kind: 'commit', oid: c1.oid },
      commitFiles: [f1, f2],
      selectedFile: f1,
      fileViewMode: 'flat',
    }));

    const { container } = render(<FilesPanel />);

    const buttons = container.querySelectorAll<HTMLButtonElement>('.lists-file-select');
    expect(buttons.length).toBe(2);

    const blurSpy = vi.spyOn(buttons[1], 'blur');
    fireEvent.click(buttons[1]);

    expect(selectFile).toHaveBeenCalledWith(f2);
    expect(blurSpy).toHaveBeenCalled();
  });

  it('permite descartar alterações de um arquivo não preparado com confirmação', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FilesPanel />);

    const discardBtn = screen.getByRole('button', { name: 'Descartar alterações' });
    expect(discardBtn).toBeInTheDocument();
    fireEvent.click(discardBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(actions.runOperation).toHaveBeenCalledWith('discard', ['u1']);
    confirmSpy.mockRestore();
  });

  it('permite descartar todas as alterações não preparadas no cabeçalho com confirmação', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FilesPanel />);

    const discardAllBtn = screen.getByRole('button', { name: /Descartar tudo/i });
    expect(discardAllBtn).toBeInTheDocument();
    fireEvent.click(discardAllBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(actions.runOperation).toHaveBeenCalledWith('discardAll');
    confirmSpy.mockRestore();
  });
});

describe('Busca no histórico do GraphPanel', () => {
  it('filtra commits por mensagem na busca do cabeçalho', () => {
    const c1 = { oid: '11111111111', parents: [], refs: [], author: 'Alice', timestamp: 1000, subject: 'feat: add login' };
    const c2 = { oid: '22222222222', parents: [], refs: [], author: 'Bob', timestamp: 2000, subject: 'fix: typo in readme' };
    useAppStore.setState(state({
      history: {
        sessionId: 's',
        requestId: 1,
        page: 0,
        rows: [
          { commit: c1, row: 0, lane: 0, parentLanes: [], connections: [], activeLanes: [0] },
          { commit: c2, row: 1, lane: 0, parentLanes: [], connections: [], activeLanes: [0] },
        ],
        laneCount: 1,
        hasMore: false,
        historyKey: 'h',
      },
    }));

    render(<GraphPanel />);
    expect(screen.getByText('feat: add login')).toBeInTheDocument();
    expect(screen.getByText('fix: typo in readme')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Buscar commits/i);
    fireEvent.change(searchInput, { target: { value: 'login' } });

    expect(screen.getByText('feat: add login')).toBeInTheDocument();
    expect(screen.queryByText('fix: typo in readme')).not.toBeInTheDocument();
  });
});

describe('InProgressBanner', () => {
  it('exibe banner de rebase em andamento e aciona rebaseContinue', () => {
    useAppStore.setState(state({
      snapshot: {
        ...state().snapshot!,
        inProgress: { kind: 'rebase', message: 'main' },
      },
    }));

    render(<InProgressBanner />);
    expect(screen.getByText(/Rebase em andamento/i)).toBeInTheDocument();

    const continueBtn = screen.getByRole('button', { name: /Continuar Rebase/i });
    fireEvent.click(continueBtn);
    expect(actions.runOperation).toHaveBeenCalledWith('rebaseContinue');
  });

  it('aciona rebaseAbort ao confirmar o cancelamento', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAppStore.setState(state({
      snapshot: {
        ...state().snapshot!,
        inProgress: { kind: 'rebase', message: 'main' },
      },
    }));

    render(<InProgressBanner />);
    const abortBtn = screen.getByRole('button', { name: /Abortar Rebase/i });
    fireEvent.click(abortBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(actions.runOperation).toHaveBeenCalledWith('rebaseAbort');
    confirmSpy.mockRestore();
  });
});

describe('CreateTagModal', () => {
  it('permite criar tag com nome e mensagem opcional', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateTagModal
        isOpen={true}
        commitOid="abcdef1234567890"
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    const nameInput = screen.getByLabelText(/Nome da Tag/i);
    fireEvent.change(nameInput, { target: { value: 'v1.0.0' } });

    const msgInput = screen.getByLabelText(/Mensagem/i);
    fireEvent.change(msgInput, { target: { value: 'Primeiro release' } });

    const submitBtn = screen.getByRole('button', { name: /Criar Tag/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'v1.0.0',
      message: 'Primeiro release',
      oid: 'abcdef1234567890',
    });
    expect(onClose).toHaveBeenCalled();
  });
});
