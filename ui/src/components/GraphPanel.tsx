import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Archive, GitBranch, Search, Tag, User, X } from 'lucide-react';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';
import type { GraphRow } from '../lib/types';
import { ContextMenu } from './ContextMenu';
import { CreateTagModal } from './CreateTagModal';
import { NewBranchModal } from './NewBranchModal';
import { ResetModal } from './ResetModal';
import { RefPopover, type ParsedRef } from './RefPopover';
import { buildTree, flattenTree } from './FilesPanel';
import './Lists.css';

const ROW_HEIGHT = 28;
const NODE_Y = 14;
const LANE_GAP = 16;
const GRAPH_LEFT = 16;

const LANE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald green
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#eab308', // amber
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f43f5e', // rose
];

function colourFor(lane: number) {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function shortHash(oid: string) {
  return oid.slice(0, 7);
}

export function formatDateOnly(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatCompactDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeDate(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp * 1000) / 1000));
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} mês${months === 1 ? '' : 'es'}`;
  const years = Math.floor(months / 12);
  return `há ${years} ano${years === 1 ? '' : 's'}`;
}

export function parseRefs(refs: string[], currentBranch: string | null): ParsedRef[] {
  const seen = new Set<string>();
  const parsed: ParsedRef[] = [];

  for (const raw of refs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let name = trimmed;
    let isTag = false;
    let isStash = false;

    if (trimmed.startsWith('HEAD -> ')) {
      name = trimmed.slice(8);
    } else if (trimmed === 'HEAD') {
      name = 'HEAD';
    } else if (trimmed.startsWith('tag: ')) {
      name = trimmed.slice(5).trim();
      if (name.startsWith('refs/tags/')) {
        name = name.slice(10).trim();
      }
      isTag = true;
    } else if (trimmed.startsWith('refs/tags/')) {
      name = trimmed.slice(10).trim();
      isTag = true;
    } else if (trimmed.startsWith('refs/heads/')) {
      name = trimmed.slice(11).trim();
    } else if (trimmed === 'refs/stash' || trimmed === 'stash' || trimmed.startsWith('stash@')) {
      name = trimmed === 'refs/stash' ? 'stash' : trimmed;
      isStash = true;
    }

    const isRemote =
      !isTag &&
      !isStash &&
      (name.startsWith('origin/') ||
        name.startsWith('remotes/') ||
        name.startsWith('upstream/'));
    const isHead =
      !isRemote &&
      !isTag &&
      !isStash &&
      ((currentBranch !== null && name === currentBranch) ||
        (currentBranch === null && (trimmed === 'HEAD' || trimmed.startsWith('HEAD -> '))));

    const key = `${name}:${isTag ? 'tag' : isStash ? 'stash' : isRemote ? 'remote' : 'local'}`;
    if (seen.has(key)) {
      const existing = parsed.find(
        (p) => p.name === name && p.isTag === isTag && p.isRemote === isRemote && p.isStash === isStash
      );
      if (existing && isHead) existing.isHead = true;
      continue;
    }
    seen.add(key);

    parsed.push({ raw: trimmed, name, isHead, isRemote, isTag, isStash });
  }

  // Strictly order:
  // 1. HEAD (current checked-out branch)
  // 2. Local branches
  // 3. Tags
  // 4. Stashes
  // 5. Remote branches
  parsed.sort((a, b) => {
    const priority = (r: ParsedRef) => {
      if (r.isHead) return 0;
      if (!r.isRemote && !r.isTag && !r.isStash) return 1;
      if (r.isTag) return 2;
      if (r.isStash) return 3;
      return 4;
    };
    const pDiff = priority(a) - priority(b);
    if (pDiff !== 0) return pDiff;
    return a.name.localeCompare(b.name);
  });

  return parsed;
}

function UncommittedLane({ targetLane, laneCount, width }: { targetLane: number; laneCount: number; width?: number }) {
  const w = width ?? Math.max(40, GRAPH_LEFT + laneCount * LANE_GAP + 10);
  const laneX = (lane: number) => GRAPH_LEFT + lane * LANE_GAP;
  const x = laneX(targetLane);
  return (
    <svg className="lists-graph-lanes" width={w} height={ROW_HEIGHT} aria-hidden="true">
      <line x1={x} y1={NODE_Y} x2={x} y2={ROW_HEIGHT} stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 3" />
      <circle cx={x} cy={NODE_Y} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  );
}

interface RowGeometry {
  upperLanes: number[];
  passingLanes: number[];
}

function GraphLanes({
  row,
  geom,
  laneCount,
  width,
}: {
  row: GraphRow;
  geom: RowGeometry;
  laneCount: number;
  width?: number;
}) {
  const w = width ?? Math.max(40, GRAPH_LEFT + laneCount * LANE_GAP + 10);
  const laneX = (lane: number) => GRAPH_LEFT + lane * LANE_GAP;

  const paths: React.ReactNode[] = [];

  // 1. Passing lanes through the entire row: y=0 to y=ROW_HEIGHT
  for (const lane of geom.passingLanes) {
    const x = laneX(lane);
    paths.push(
      <line
        key={`pass-${lane}`}
        x1={x}
        x2={x}
        y1={0}
        y2={ROW_HEIGHT}
        stroke={colourFor(lane)}
        strokeWidth={2}
      />
    );
  }

  // 2. Upper line connecting into this commit node: y=0 to y=NODE_Y (only if incoming from row above)
  if (geom.upperLanes.includes(row.lane)) {
    const x = laneX(row.lane);
    paths.push(
      <line
        key={`in-${row.lane}`}
        x1={x}
        x2={x}
        y1={0}
        y2={NODE_Y}
        stroke={colourFor(row.lane)}
        strokeWidth={2}
      />
    );
  }

  // 3. Outgoing connections from this commit node: y=NODE_Y to y=ROW_HEIGHT
  for (let idx = 0; idx < row.connections.length; idx++) {
    const conn = row.connections[idx];
    const fromX = laneX(conn.from);
    const toX = laneX(conn.to);
    const colour = colourFor(conn.to);

    if (conn.from === conn.to) {
      // Straight line downwards
      paths.push(
        <line
          key={`out-${conn.from}-${conn.to}-${idx}`}
          x1={fromX}
          x2={toX}
          y1={NODE_Y}
          y2={ROW_HEIGHT}
          stroke={colour}
          strokeWidth={2}
        />
      );
    } else {
      // Smooth S-curve (cubic bezier)
      paths.push(
        <path
          key={`curve-${conn.from}-${conn.to}-${idx}`}
          d={`M ${fromX} ${NODE_Y} C ${fromX} ${NODE_Y + 7}, ${toX} ${NODE_Y + 7}, ${toX} ${ROW_HEIGHT}`}
          fill="none"
          stroke={colour}
          strokeWidth={2}
        />
      );
    }
  }

  const isStash =
    row.commit.refs.some(
      (r) => r.includes('stash') || r.startsWith('stash@') || r === 'refs/stash'
    ) || row.commit.subject.startsWith('WIP on ');

  return (
    <svg className="lists-graph-lanes" width={w} height={ROW_HEIGHT} aria-hidden="true">
      {paths}
      {isStash ? (
        <g transform={`translate(${laneX(row.lane)}, ${NODE_Y})`}>
          <circle r={6.5} fill="var(--surface)" stroke={colourFor(row.lane)} strokeWidth={1.5} />
          {/* Stash tray: └─┘ */}
          <path
            d="M -3.5 1 L -3.5 3.5 L 3.5 3.5 L 3.5 1"
            fill="none"
            stroke={colourFor(row.lane)}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Arrow pointing down: ↓ */}
          <line
            x1={0}
            y1={-3.5}
            x2={0}
            y2={1}
            stroke={colourFor(row.lane)}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          <path
            d="M -1.8 -0.8 L 0 1 L 1.8 -0.8"
            fill="none"
            stroke={colourFor(row.lane)}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : (
        <circle
          cx={laneX(row.lane)}
          cy={NODE_Y}
          r={4.5}
          fill="var(--surface)"
          stroke={colourFor(row.lane)}
          strokeWidth={2.2}
        />
      )}
    </svg>
  );
}

export function GraphPanel() {
  const history = useAppStore((state) => state.history);
  const snapshot = useAppStore((state) => state.snapshot);
  const context = useAppStore((state) => state.context);
  const selectLocal = useAppStore((state) => state.selectLocal);
  const selectCommit = useAppStore((state) => state.selectCommit);
  const loadMore = useAppStore((state) => state.loadMore);
  const runOperation = useAppStore((state) => state.runOperation);
  const activePane = useAppStore((state) => state.activePane);
  const setActivePane = useAppStore((state) => state.setActivePane);
  const commitFiles = useAppStore((state) => state.commitFiles);
  const selectedFile = useAppStore((state) => state.selectedFile);
  const selectFile = useAppStore((state) => state.selectFile);
  const fileViewMode = useAppStore((state) => state.fileViewMode);
  const setCommitMessage = useAppStore((state) => state.setCommitMessage);
  const { t } = useI18n();

  const [graphWidth, setGraphWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('Gitma:history-graph-width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (val >= 40 && val <= 300) return val;
      }
    } catch {}
    return 64;
  });

  const [authorWidth, setAuthorWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('Gitma:history-author-width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (val >= 60 && val <= 500) return val;
      }
    } catch {}
    return 110;
  });

  const [dateWidth, setDateWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('Gitma:history-date-width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (val >= 50 && val <= 220) return val;
      }
    } catch {}
    return 86;
  });

  const effectiveGraphWidth = Math.max(
    graphWidth,
    GRAPH_LEFT + (history?.laneCount ?? 1) * LANE_GAP + 10
  );

  const handleGraphResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = effectiveGraphWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.max(40, Math.min(300, startWidth + delta));
      setGraphWidth(newWidth);
      try {
        localStorage.setItem('Gitma:history-graph-width', String(newWidth));
      } catch {}
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Redimensionador entre Mensagem e Hash: mover para direita aumenta Mensagem e reduz Autor
  const handleMsgResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startAuthorWidth = authorWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      // Ao arrastar para direita (delta > 0), a Mensagem expande e o Autor reduz
      const newAuthorWidth = Math.max(60, Math.min(450, startAuthorWidth - delta));
      setAuthorWidth(newAuthorWidth);
      try {
        localStorage.setItem('Gitma:history-author-width', String(newAuthorWidth));
      } catch {}
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Redimensionador entre Autor e Data: mover para direita aumenta Autor e reduz Data
  const handleAuthorDateResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startDateWidth = dateWidth;
    const startAuthorWidth = authorWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      // Ao arrastar para direita (delta > 0), o Autor expande para a direita e a Data encolhe
      const newDateWidth = Math.max(50, Math.min(220, startDateWidth - delta));
      const appliedDelta = startDateWidth - newDateWidth;
      const newAuthorWidth = Math.max(60, Math.min(500, startAuthorWidth + appliedDelta));
      setDateWidth(newDateWidth);
      setAuthorWidth(newAuthorWidth);
      try {
        localStorage.setItem('Gitma:history-date-width', String(newDateWidth));
        localStorage.setItem('Gitma:history-author-width', String(newAuthorWidth));
      } catch {}
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    branchName?: string | null;
    tagName?: string | null;
    isCurrentBranch?: boolean;
    isRemoteBranch?: boolean;
    isStash?: boolean;
    commitOid: string;
  } | null>(null);

  const [createTagModal, setCreateTagModal] = useState<{
    isOpen: boolean;
    commitOid: string;
  }>({ isOpen: false, commitOid: '' });

  const [searchFilter, setSearchFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [refPopover, setRefPopover] = useState<{
    x: number;
    y: number;
    refs: ParsedRef[];
    laneColor: string;
    commitOid: string;
  } | null>(null);

  const [newBranchModal, setNewBranchModal] = useState<{
    isOpen: boolean;
    startPoint?: string;
  }>({ isOpen: false });

  const [resetModal, setResetModal] = useState<{
    isOpen: boolean;
    commitOid: string;
    commitSubject?: string;
  } | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const requestedAtLength = useRef(-1);
  const rows = history?.rows ?? [];

  const filteredRows = useMemo(() => {
    if (!searchFilter.trim()) return rows;
    const q = searchFilter.trim().toLowerCase();
    return rows.filter((r) => {
      const subj = r.commit.subject.toLowerCase();
      const author = r.commit.author.toLowerCase();
      const oid = r.commit.oid.toLowerCase();
      return subj.includes(q) || author.includes(q) || oid.includes(q);
    });
  }, [rows, searchFilter]);

  const totalCount = filteredRows.length + 1; // 1 for Uncommitted Changes

  // Deterministic graph geometry without dangling stubs ("pontas soltas")
  const geometryList = useMemo<RowGeometry[]>(() => {
    const result: RowGeometry[] = [];
    const headLane = filteredRows[0]?.lane ?? 0;
    let currentIncoming = new Set<number>([headLane]);

    // Precalculate lanes needed at or below row i
    const laneUsages = new Array<Set<number>>(filteredRows.length);
    const activeLanesRunning = new Set<number>();
    for (let i = filteredRows.length - 1; i >= 0; i--) {
      activeLanesRunning.add(filteredRows[i].lane);
      for (const conn of filteredRows[i].connections) {
        activeLanesRunning.add(conn.to);
      }
      laneUsages[i] = new Set(activeLanesRunning);
    }

    for (let i = 0; i < filteredRows.length; i++) {
      const row = filteredRows[i];
      const upperLanes: number[] = [];
      const passingLanes: number[] = [];
      const nextOutgoing = new Set<number>();

      // 1. Process incoming lanes
      for (const lane of currentIncoming) {
        upperLanes.push(lane);
        if (lane !== row.lane) {
          const isNeededBelow = i + 1 < filteredRows.length && Boolean(laneUsages[i + 1]?.has(lane));
          if (isNeededBelow) {
            passingLanes.push(lane);
            nextOutgoing.add(lane);
          }
        }
      }

      // 2. Process outgoing connections from this commit
      for (const conn of row.connections) {
        nextOutgoing.add(conn.to);
      }

      result.push({ upperLanes, passingLanes });
      currentIncoming = nextOutgoing;
    }

    return result;
  }, [filteredRows]);

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [totalCount, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (
      history?.hasMore &&
      rows.length > 0 &&
      rows.length !== requestedAtLength.current &&
      virtualItems.some((item) => item.index >= rows.length - 8)
    ) {
      requestedAtLength.current = rows.length;
      void loadMore();
    }
  }, [history?.hasMore, loadMore, rows.length, virtualItems]);

  const [copiedOid, setCopiedOid] = useState<string | null>(null);

  const handleCopyHash = async (oid: string) => {
    try {
      await navigator.clipboard.writeText(oid);
      setCopiedOid(oid);
      setTimeout(() => setCopiedOid((cur) => (cur === oid ? null : cur)), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = oid;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedOid(oid);
      setTimeout(() => setCopiedOid((cur) => (cur === oid ? null : cur)), 1500);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const activeElement = document.activeElement;
        const tagName = activeElement?.tagName?.toLowerCase();
        if (activePane === 'history' || !['input', 'textarea', 'select'].includes(tagName ?? '')) {
          e.preventDefault();
          setActivePane('history');
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
          return;
        }
      }

      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (activePane !== 'history') return;

      const activeElement = document.activeElement;
      const tagName = activeElement?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
      if (activeElement?.getAttribute('contenteditable') === 'true') return;
      if (contextMenu || refPopover || newBranchModal.isOpen || resetModal || createTagModal.isOpen) return;

      const currentIndex =
        context.kind === 'local'
          ? 0
          : context.kind === 'commit'
          ? filteredRows.findIndex((r) => r.commit.oid === context.oid) + 1
          : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1;
        if (nextIndex < totalCount) {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          if (nextIndex === 0) {
            void selectLocal();
            virtualizer.scrollToIndex?.(0, { align: 'auto' });
          } else {
            const nextRow = filteredRows[nextIndex - 1];
            if (nextRow) {
              void selectCommit(nextRow.commit.oid);
              virtualizer.scrollToIndex?.(nextIndex, { align: 'auto' });
              if (!searchFilter.trim() && nextIndex >= filteredRows.length - 5 && history?.hasMore) {
                void loadMore();
              }
            }
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentIndex > 0) {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          const prevIndex = currentIndex - 1;
          if (prevIndex === 0) {
            void selectLocal();
            virtualizer.scrollToIndex?.(0, { align: 'auto' });
          } else {
            const prevRow = filteredRows[prevIndex - 1];
            if (prevRow) {
              void selectCommit(prevRow.commit.oid);
              virtualizer.scrollToIndex?.(prevIndex, { align: 'auto' });
            }
          }
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActivePane('files');
        const rawFiles =
          context.kind === 'commit'
            ? commitFiles
            : [...(snapshot?.staged ?? []), ...(snapshot?.unstaged ?? [])];
        const filesToPick =
          fileViewMode === 'tree'
            ? flattenTree(buildTree(rawFiles), new Set()).filter((n) => !n.isDir && n.file).map((n) => n.file!)
            : rawFiles;
        if (filesToPick.length > 0 && (!selectedFile || !filesToPick.some((f) => f.id === selectedFile.id))) {
          void selectFile(filesToPick[0]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activePane,
    context,
    filteredRows,
    totalCount,
    searchFilter,
    history?.hasMore,
    selectLocal,
    selectCommit,
    loadMore,
    virtualizer,
    contextMenu,
    refPopover,
    newBranchModal.isOpen,
    resetModal,
    createTagModal.isOpen,
    setActivePane,
    commitFiles,
    snapshot,
    selectedFile,
    selectFile,
    fileViewMode,
  ]);

  const stagedCount = snapshot?.staged.length ?? 0;
  const unstagedCount = snapshot?.unstaged.length ?? 0;
  const totalLocalChanges = stagedCount + unstagedCount;

  return (
    <section
      className={`lists-panel lists-graph-panel ${activePane === 'history' ? 'is-pane-active' : ''}`}
      aria-label={t('history.title')}
      onClick={() => setActivePane('history')}
    >
      <header className="lists-panel-header lists-graph-header-top">
        <div className="lists-panel-header-title">
          <h2>{t('history.title')}</h2>
          <span className="lists-header-sep">-</span>
          <span className="lists-header-count">
            {filteredRows.length}
            {searchFilter ? ` ${t('history.of')} ${rows.length}` : ''}
            {history?.hasMore ? '+' : ''} {t('history.commitsCount')}
          </span>
        </div>
        <div className="lists-history-search">
          <Search size={12} className="lists-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="lists-search-input"
            placeholder={t('history.searchPlaceholder')}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (searchFilter) {
                  setSearchFilter('');
                } else {
                  searchInputRef.current?.blur();
                }
              }
            }}
          />
          {searchFilter && (
            <button
              type="button"
              className="lists-search-clear"
              onClick={() => setSearchFilter('')}
              title={t('history.clearSearch')}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </header>

      {/* Cabeçalho de 5 colunas com separadores verticais contínuos e redimensionadores */}
      <div className="lists-graph-header" role="row">
        <div className="lists-header-col-graph" style={{ width: `${effectiveGraphWidth}px` }}>
          <span>{t('history.colGraph')}</span>
        </div>
        <div className="lists-col-divider lists-col-divider-resizable">
          <div
            className="lists-header-resizer"
            onMouseDown={handleGraphResizeMouseDown}
            title={t('history.resizeGraph')}
            role="separator"
            aria-orientation="vertical"
          />
        </div>
        <div className="lists-header-col-msg">
          <span>{t('history.colMsg')}</span>
        </div>
        <div className="lists-col-divider lists-col-divider-resizable">
          <div
            className="lists-header-resizer"
            onMouseDown={handleMsgResizeMouseDown}
            title={t('history.resizeMsg')}
            role="separator"
            aria-orientation="vertical"
          />
        </div>
        <div className="lists-header-col-hash">
          <span>{t('history.colHash')}</span>
        </div>
        <div className="lists-col-divider" />
        <div className="lists-header-col-author" style={{ width: `${authorWidth}px` }}>
          <span>{t('history.colAuthor')}</span>
        </div>
        <div className="lists-col-divider lists-col-divider-resizable">
          <div
            className="lists-header-resizer"
            onMouseDown={handleAuthorDateResizeMouseDown}
            title={t('history.resizeAuthorDate')}
            role="separator"
            aria-orientation="vertical"
          />
        </div>
        <div className="lists-header-col-date" style={{ width: `${dateWidth}px` }}>
          <span>{t('history.colDate')}</span>
        </div>
      </div>

      <div ref={viewportRef} className="lists-scroll" tabIndex={0} role="list" aria-label="Commits">
        <div className="lists-virtual-content" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((item) => {
            // Row 0: Uncommitted changes
            if (item.index === 0) {
              const isLocalActive = context.kind === 'local';
              return (
                <button
                  type="button"
                  role="listitem"
                  aria-current={isLocalActive ? 'true' : undefined}
                  key="uncommitted-changes"
                  className={`lists-graph-row lists-uncommitted-row ${isLocalActive ? 'lists-row-selected' : ''}`}
                  style={{ transform: `translateY(${item.start}px)`, height: `${ROW_HEIGHT}px` }}
                  onClick={(e) => {
                    setActivePane('history');
                    void selectLocal();
                    (e.currentTarget as HTMLElement).blur();
                  }}
                  title={t('history.uncommittedTitle')}
                >
                  <div className="lists-col-graph" style={{ width: `${effectiveGraphWidth}px` }}>
                    <UncommittedLane
                      targetLane={rows[0]?.lane ?? 0}
                      laneCount={history?.laneCount ?? 1}
                      width={effectiveGraphWidth}
                    />
                  </div>
                  <div className="lists-col-divider" />
                  <div className="lists-col-msg">
                    <div
                      className="lists-msg-container"
                      title={`${t('history.uncommittedTitle')} ${
                        totalLocalChanges === 0
                          ? t('history.clean')
                          : `(${totalLocalChanges} ${totalLocalChanges === 1 ? t('history.modified') : t('history.modifiedPlural')})`
                      }`}
                    >
                      <span className="lists-uncommitted-title">{t('history.uncommittedTitle')}</span>
                      <span className="lists-uncommitted-sub">
                        {totalLocalChanges === 0
                          ? t('history.clean')
                          : `(${totalLocalChanges} ${totalLocalChanges === 1 ? t('history.modified') : t('history.modifiedPlural')})`}
                      </span>
                    </div>
                  </div>
                  <div className="lists-col-divider" />
                  <div className="lists-col-hash">
                    <span className="lists-meta-dash">—</span>
                  </div>
                  <div className="lists-col-divider" />
                  <div className="lists-col-author" style={{ width: `${authorWidth}px` }}>
                    <span className="lists-meta-dash">{t('history.uncommittedWorkingTree')}</span>
                  </div>
                  <div className="lists-col-divider" />
                  <div className="lists-col-date" style={{ width: `${dateWidth}px` }}>
                    <span className="lists-meta-dash">—</span>
                  </div>
                </button>
              );
            }

            // Historical commits
            const rowIndex = item.index - 1;
            const row = filteredRows[rowIndex];
            if (!row) return null;
            const geom = geometryList[rowIndex] ?? { upperLanes: [], passingLanes: [] };
            const commit = row.commit;
            const parsedRefs = parseRefs(commit.refs, snapshot?.branch ?? null);
            const isSelected = context.kind === 'commit' && context.oid === commit.oid;
            const visibleRefs = parsedRefs.slice(0, 2);
            const overflowRefs = parsedRefs.slice(2);
            const laneColor = colourFor(row.lane);

            return (
              <button
                type="button"
                role="listitem"
                aria-current={isSelected ? 'true' : undefined}
                key={`${commit.oid}-${item.index}`}
                className={`lists-graph-row ${isSelected ? 'lists-row-selected' : ''}`}
                style={{ transform: `translateY(${item.start}px)`, height: `${ROW_HEIGHT}px` }}
                onClick={(e) => {
                  setActivePane('history');
                  void selectCommit(commit.oid);
                  (e.currentTarget as HTMLElement).blur();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRefPopover(null);
                  const stashRef = parsedRefs.find((r) => r.isStash);
                  const tagRef = parsedRefs.find((r) => r.isTag);
                  const regularRef = parsedRefs.find((r) => !r.isTag && !r.isStash);
                  const targetRef = stashRef ?? regularRef;
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    branchName: targetRef?.name ?? null,
                    tagName: tagRef?.name ?? null,
                    isCurrentBranch: parsedRefs.some((r) => r.isHead),
                    isRemoteBranch: targetRef?.isRemote ?? false,
                    isStash: !!stashRef,
                    commitOid: commit.oid,
                  });
                }}
                title={`${commit.subject} — ${commit.oid}`}
              >
                {/* Coluna 1: Grafo */}
                <div className="lists-col-graph" style={{ width: `${effectiveGraphWidth}px` }}>
                  <GraphLanes
                    row={row}
                    geom={geom}
                    laneCount={history?.laneCount ?? 1}
                    width={effectiveGraphWidth}
                  />
                </div>

                <div className="lists-col-divider" />

                {/* Coluna 2: Mensagem (Refs + Subject) */}
                <div className="lists-col-msg">
                  <div className="lists-msg-container">
                    {commit.refs.length > 0 && (
                      <span className="lists-refs" title={commit.refs.join(', ')}>
                        {visibleRefs.map((ref) => {
                          const isLight =
                            typeof document !== 'undefined' &&
                            document.documentElement.getAttribute('data-theme-type') === 'light';

                          const chipStyle: React.CSSProperties | undefined = ref.isTag
                            ? undefined
                            : ref.isStash
                            ? {
                                background: isLight ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.15)',
                                borderColor: isLight ? '#d97706' : '#f59e0b',
                                color: isLight ? '#b45309' : '#fcd34d',
                              }
                            : ref.isHead
                            ? {
                                background: laneColor,
                                borderColor: laneColor,
                                color: '#ffffff',
                                boxShadow: `0 1px 4px ${laneColor}66`,
                              }
                            : ref.isRemote
                            ? {
                                background: isLight
                                  ? `color-mix(in srgb, ${laneColor} 10%, transparent)`
                                  : `color-mix(in srgb, ${laneColor} 8%, transparent)`,
                                borderColor: isLight
                                  ? `color-mix(in srgb, ${laneColor} 60%, transparent)`
                                  : `color-mix(in srgb, ${laneColor} 50%, transparent)`,
                                color: isLight
                                  ? `color-mix(in srgb, ${laneColor} 80%, black)`
                                  : `color-mix(in srgb, ${laneColor} 70%, white)`,
                              }
                            : {
                                background: isLight
                                  ? `color-mix(in srgb, ${laneColor} 12%, transparent)`
                                  : `color-mix(in srgb, ${laneColor} 14%, transparent)`,
                                borderColor: laneColor,
                                color: isLight
                                  ? `color-mix(in srgb, ${laneColor} 85%, black)`
                                  : `color-mix(in srgb, ${laneColor} 85%, white)`,
                              };

                          const iconColor = ref.isTag
                            ? isLight
                              ? '#b45309'
                              : '#fbbf24'
                            : ref.isStash
                            ? isLight
                              ? '#b45309'
                              : '#f59e0b'
                            : ref.isHead
                            ? '#ffffff'
                            : ref.isRemote
                            ? isLight
                              ? `color-mix(in srgb, ${laneColor} 80%, black)`
                              : `color-mix(in srgb, ${laneColor} 70%, white)`
                            : laneColor;

                          return (
                            <span
                              key={ref.raw}
                              style={chipStyle}
                              className={`lists-ref ${ref.isHead ? 'lists-ref-head' : ref.isRemote ? 'lists-ref-remote' : ref.isTag ? 'lists-ref-tag' : ref.isStash ? 'lists-ref-stash' : 'lists-ref-local'}`}
                              title={ref.raw}
                              onClick={(e) => {
                                if (!ref.isStash) {
                                  e.stopPropagation();
                                  if (!ref.isHead) {
                                    void runOperation('switchBranch', [], ref.name);
                                  }
                                }
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setRefPopover(null);
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  branchName: ref.isTag || ref.isStash ? null : ref.name,
                                  tagName: ref.isTag ? ref.name : null,
                                  isCurrentBranch: ref.isHead,
                                  isRemoteBranch: ref.isRemote,
                                  isStash: ref.isStash,
                                  commitOid: commit.oid,
                                });
                              }}
                            >
                              {ref.isTag ? (
                                <Tag size={10} color={iconColor} />
                              ) : ref.isStash ? (
                                <Archive size={10} color={iconColor} />
                              ) : (
                                <GitBranch size={10} color={iconColor} />
                              )}
                              <span className="lists-ref-name">{ref.name}</span>
                              {ref.isHead && <span className="lists-ref-dot">•</span>}
                            </span>
                          );
                        })}

                        {overflowRefs.length > 0 && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="lists-ref-overflow"
                            title={`${overflowRefs.length} ${t('history.moreRefs')}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setContextMenu(null);
                              const rect = e.currentTarget.getBoundingClientRect();
                              setRefPopover({
                                x: rect.left,
                                y: rect.bottom + 4,
                                refs: parsedRefs,
                                laneColor,
                                commitOid: commit.oid,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                setContextMenu(null);
                                const rect = e.currentTarget.getBoundingClientRect();
                                setRefPopover({
                                  x: rect.left,
                                  y: rect.bottom + 4,
                                  refs: parsedRefs,
                                  laneColor,
                                  commitOid: commit.oid,
                                });
                              }
                            }}
                          >
                            +{overflowRefs.length}
                          </span>
                        )}
                        <span className="lists-ref-dash">-</span>
                      </span>
                    )}

                    <span className="lists-graph-subject" title={commit.subject}>
                      {commit.subject}
                    </span>
                  </div>
                </div>

                <div className="lists-col-divider" />

                {/* Coluna 3: Hash */}
                <div className="lists-col-hash">
                  <code
                    className={`lists-commit-hash ${copiedOid === commit.oid ? 'is-copied' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopyHash(commit.oid);
                    }}
                    title={t('files.clickToCopy')}
                    role="button"
                    tabIndex={0}
                  >
                    {copiedOid === commit.oid ? t('history.copied') : shortHash(commit.oid)}
                  </code>
                </div>

                <div className="lists-col-divider" />

                {/* Coluna 4: Autor */}
                <div className="lists-col-author" style={{ width: `${authorWidth}px` }} title={`${t('history.colAuthor')}: ${commit.author}`}>
                  <User size={11} className="lists-author-icon" />
                  <span className="lists-graph-author">{commit.author}</span>
                </div>

                <div className="lists-col-divider" />

                {/* Coluna 5: Data */}
                <div className="lists-col-date" style={{ width: `${dateWidth}px` }}>
                  <time
                    className="lists-graph-date"
                    dateTime={new Date(commit.timestamp * 1000).toISOString()}
                    title={new Date(commit.timestamp * 1000).toLocaleString('pt-BR')}
                  >
                    {formatDateOnly(commit.timestamp)}
                  </time>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {refPopover && (
        <RefPopover
          x={refPopover.x}
          y={refPopover.y}
          refs={refPopover.refs}
          laneColor={refPopover.laneColor}
          currentBranch={snapshot?.branch}
          activeRefName={
            contextMenu && contextMenu.commitOid === refPopover.commitOid
              ? (contextMenu.tagName ?? contextMenu.branchName)
              : null
          }
          onClose={() => {
            setRefPopover(null);
            setContextMenu(null);
          }}
          onCloseContextMenu={() => setContextMenu(null)}
          onCheckoutBranch={(branch) => {
            setContextMenu(null);
            void runOperation('switchBranch', [], branch);
          }}
          onOpenContextMenu={(e, ref) => {
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              branchName: ref.isTag ? null : ref.name,
              tagName: ref.isTag ? ref.name : null,
              isCurrentBranch: ref.isHead,
              isRemoteBranch: ref.isRemote,
              isStash: ref.isStash,
              commitOid: refPopover.commitOid,
            });
          }}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          branchName={contextMenu.branchName}
          tagName={contextMenu.tagName}
          isCurrentBranch={contextMenu.isCurrentBranch}
          isRemoteBranch={contextMenu.isRemoteBranch}
          isStash={contextMenu.isStash}
          currentBranchName={snapshot?.branch}
          commitOid={contextMenu.commitOid}
          onClose={() => setContextMenu(null)}
          onCheckoutBranch={(branch) => {
            setRefPopover(null);
            void runOperation('switchBranch', [], branch);
          }}
          onCheckoutTag={(tagName) => {
            setRefPopover(null);
            const cleanTag = tagName.replace(/^refs\/tags\//, '').replace(/^tag:\s*/, '').trim();
            void runOperation('switchBranch', [], cleanTag);
          }}
          onPushTag={(tagName) => {
            setRefPopover(null);
            const cleanTag = tagName.replace(/^refs\/tags\//, '').replace(/^tag:\s*/, '').trim();
            void runOperation('pushTag', [], JSON.stringify({ name: cleanTag }));
          }}
          onMergeBranch={(branch) => {
            setRefPopover(null);
            void runOperation('mergeBranch', [], branch);
          }}
          onMergeSquash={(branch) => {
            setRefPopover(null);
            if (window.confirm(t('history.squashConfirm', { branch, target: snapshot?.branch ?? 'HEAD' }))) {
              void runOperation('mergeSquash', [], branch);
            }
          }}
          onRebase={(target) => {
            setRefPopover(null);
            if (
              window.confirm(
                t('history.rebaseConfirm', {
                  branch: snapshot?.branch ?? 'HEAD',
                  target: target.length === 40 ? target.slice(0, 7) : target,
                })
              )
            ) {
              void runOperation('rebase', [], target);
            }
          }}
          onSquashTo={(commitOid) => {
            setRefPopover(null);
            const targetIdx = rows.findIndex((r) => r.commit.oid === commitOid);
            if (targetIdx === -1) return;
            const squashedRows = rows.slice(0, targetIdx);
            if (squashedRows.length === 0) {
              alert(t('contextMenu.squashIsHeadAlert'));
              return;
            }
            const subjects = squashedRows.map((r) => `- ${r.commit.subject}`).join('\n');
            const combinedMessage = `${t('contextMenu.squashCommitMessage', { count: squashedRows.length })}\n\n${subjects}`;
            if (
              window.confirm(
                t('contextMenu.squashConfirm', {
                  count: squashedRows.length,
                  target: commitOid.slice(0, 7),
                })
              )
            ) {
              void runOperation('reset', [], JSON.stringify({ commitOid, mode: 'soft' })).then(() => {
                setCommitMessage(combinedMessage);
                void selectLocal();
              });
            }
          }}
          onCreateBranch={(startPoint) => {
            setRefPopover(null);
            setNewBranchModal({ isOpen: true, startPoint });
          }}
          onDeleteBranch={(branch) => {
            if (window.confirm(t('contextMenu.deleteBranchConfirm', { branch }))) {
              setRefPopover(null);
              void runOperation('deleteBranch', [], JSON.stringify({ branch, force: true }));
            }
          }}
          onDeleteRemoteBranch={(branch) => {
            if (window.confirm(t('contextMenu.deleteRemoteBranchConfirm', { branch }))) {
              setRefPopover(null);
              void runOperation('deleteRemoteBranch', [], branch);
            }
          }}
          onCherryPick={(oid) => {
            setRefPopover(null);
            void runOperation('cherryPick', [], oid);
          }}
          onRevertCommit={(commitOid) => {
            setRefPopover(null);
            const commitRow = rows.find((r) => r.commit.oid === commitOid);
            const subj = commitRow?.commit.subject ?? commitOid.slice(0, 7);
            if (
              window.confirm(
                t('contextMenu.revertCommitConfirm', {
                  hash: commitOid.slice(0, 7),
                  subject: subj,
                })
              )
            ) {
              void runOperation('revertCommit', [], commitOid);
            }
          }}
          onCreateTag={(commitOid) => {
            setRefPopover(null);
            setCreateTagModal({ isOpen: true, commitOid });
          }}
          onDeleteTag={(tagName) => {
            setRefPopover(null);
            const cleanTag = tagName.replace(/^refs\/tags\//, '').replace(/^tag:\s*/, '').trim();
            const deleteRemote = window.confirm(
              t('contextMenu.deleteTagRemoteConfirm', { tag: cleanTag })
            );
            void runOperation('deleteTag', [], JSON.stringify({ name: cleanTag, deleteRemote }));
          }}
          onResetHead={(commitOid) => {
            setRefPopover(null);
            const commitRow = rows.find((r) => r.commit.oid === commitOid);
            setResetModal({
              isOpen: true,
              commitOid,
              commitSubject: commitRow?.commit.subject,
            });
          }}
          onStashPop={(stashRef) => {
            setRefPopover(null);
            void runOperation('stashPop', [], stashRef ?? '');
          }}
          onStashApply={(stashRef) => {
            setRefPopover(null);
            void runOperation('stashApply', [], stashRef ?? '');
          }}
          onStashDrop={(stashRef) => {
            if (window.confirm(t('contextMenu.stashDropConfirm', { name: stashRef ?? 'HEAD' }))) {
              setRefPopover(null);
              void runOperation('stashDrop', [], stashRef ?? '');
            }
          }}
          onCopyHash={(oid) => {
            setRefPopover(null);
            void navigator.clipboard.writeText(oid);
          }}
        />
      )}

      <CreateTagModal
        isOpen={createTagModal.isOpen}
        commitOid={createTagModal.commitOid}
        onClose={() => setCreateTagModal({ isOpen: false, commitOid: '' })}
        onSubmit={(params) =>
          void runOperation('createTag', [], JSON.stringify(params))
        }
      />

      <NewBranchModal
        isOpen={newBranchModal.isOpen}
        startPoint={newBranchModal.startPoint}
        onClose={() => setNewBranchModal({ isOpen: false })}
        onSubmit={(params) => void runOperation('createBranch', [], JSON.stringify(params))}
      />

      {resetModal?.isOpen && (
        <ResetModal
          isOpen={resetModal.isOpen}
          commitOid={resetModal.commitOid}
          commitSubject={resetModal.commitSubject}
          currentBranchName={snapshot?.branch}
          onClose={() => setResetModal(null)}
          onConfirm={(mode) => {
            void runOperation('reset', [], JSON.stringify({ commitOid: resetModal.commitOid, mode }));
          }}
        />
      )}
    </section>
  );
}
