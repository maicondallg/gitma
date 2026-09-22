import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import {
  ArrowRightLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePlus,
  Copy,
  FileMinus2,
  FilePenLine,
  Folder,
  FolderOpen,
  FolderTree,
  List,
  TriangleAlert,
  Undo2,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';
import type { Area, FileEntry } from '../lib/types';
import { FileContextMenu } from './FileContextMenu';
import './Lists.css';

export function formatFullDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const dateStr = d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${dateStr} às ${timeStr}`;
}

const FLAT_ROW_HEIGHT = 36;
const TREE_ROW_HEIGHT = 25;
const statusLabel: Record<FileEntry['status'], string> = {
  added: 'Adicionado',
  modified: 'Modificado',
  deleted: 'Excluído',
  renamed: 'Renomeado',
  copied: 'Copiado',
  untracked: 'Não rastreado',
  conflicted: 'Conflito',
};
const statusGlyph: Record<FileEntry['status'], LucideIcon> = {
  added: CirclePlus,
  modified: FilePenLine,
  deleted: FileMinus2,
  renamed: ArrowRightLeft,
  copied: Copy,
  untracked: CircleHelp,
  conflicted: TriangleAlert,
};

interface FileTreeNode {
  id: string;
  name: string;
  fullPath: string;
  depth: number;
  isDir: boolean;
  file?: FileEntry;
  children?: FileTreeNode[];
}

export function buildTree(files: FileEntry[]): FileTreeNode[] {
  interface MutableNode {
    id: string;
    name: string;
    fullPath: string;
    depth: number;
    isDir: boolean;
    file?: FileEntry;
    children?: Map<string, MutableNode>;
  }

  const root: Map<string, MutableNode> = new Map();

  for (const file of files) {
    const parts = file.pathDisplay.split('/');
    let currentLevel = root;
    let accumulatedPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;

      if (!currentLevel.has(part)) {
        currentLevel.set(part, {
          id: `dir:${accumulatedPath}`,
          name: part,
          fullPath: accumulatedPath,
          depth: i,
          isDir: true,
          children: new Map(),
        });
      }
      currentLevel = currentLevel.get(part)!.children!;
    }

    const fileName = parts[parts.length - 1];
    currentLevel.set(fileName, {
      id: file.id,
      name: fileName,
      fullPath: file.pathDisplay,
      depth: parts.length - 1,
      isDir: false,
      file,
    });
  }

  function convert(level: Map<string, MutableNode>, depth: number): FileTreeNode[] {
    const result: FileTreeNode[] = [];
    const dirs: MutableNode[] = [];
    const leaves: MutableNode[] = [];

    for (const node of level.values()) {
      if (node.isDir) dirs.push(node);
      else leaves.push(node);
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    leaves.sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of dirs) {
      result.push({
        id: dir.id,
        name: dir.name,
        fullPath: dir.fullPath,
        depth,
        isDir: true,
        children: convert(dir.children!, depth + 1),
      });
    }

    for (const leaf of leaves) {
      const file = leaf.file!;
      result.push({
        id: file.id,
        name: file.name,
        fullPath: file.pathDisplay,
        depth,
        isDir: false,
        file,
      });
    }
    return result;
  }

  return convert(root, 0);
}

export function flattenTree(nodes: FileTreeNode[], collapsed: Set<string>): FileTreeNode[] {
  const list: FileTreeNode[] = [];
  function traverse(items: FileTreeNode[]) {
    for (const item of items) {
      list.push(item);
      if (item.isDir && !collapsed.has(item.fullPath) && item.children) {
        traverse(item.children);
      }
    }
  }
  traverse(nodes);
  return list;
}

function FileRow({
  file,
  selected = false,
  canStage,
  disabled = false,
  indent = 0,
  showDir = true,
  isTree = false,
  onStage,
  onSelect,
  onDiscard,
  onContextMenu,
}: {
  file: FileEntry;
  selected?: boolean;
  canStage: boolean;
  disabled?: boolean;
  indent?: number;
  showDir?: boolean;
  isTree?: boolean;
  onStage: () => void;
  onSelect: () => void;
  onDiscard?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { t } = useI18n();
  const Icon = statusGlyph[file.status];
  const statusText = t(`files.status.${file.status}`);
  const actionText = file.area === 'staged' ? t('files.unstageFile') : t('files.stageFile');
  return (
    <div
      className={`lists-file-row ${isTree ? 'is-tree-file-row' : ''}`}
      style={{ paddingLeft: `${indent}px` }}
      onContextMenu={onContextMenu}
      onDoubleClick={() => {
        if (canStage && !disabled) {
          onStage();
        }
      }}
    >
      {canStage && (
        <input
          className={`lists-stage-checkbox ${isTree ? 'is-tree-checkbox' : ''}`}
          type="checkbox"
          disabled={disabled}
          checked={file.area === 'staged'}
          onChange={onStage}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${file.name}: ${actionText}`}
        />
      )}
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        className={`lists-file-select ${selected ? 'lists-row-selected' : ''} ${isTree ? 'is-tree-select' : ''}`}
        onClick={(e) => {
          onSelect();
          (e.currentTarget as HTMLElement).blur();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (canStage && !disabled) {
            onStage();
          }
        }}
        title={`${file.pathDisplay}\n(${t('files.doubleClickToToggle', { action: actionText })})`}
      >
        <span className={`lists-status lists-status-${file.status} ${isTree ? 'is-tree-status' : ''}`} title={statusText} aria-label={statusText}>
          <Icon size={isTree ? 12 : 14} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className={`lists-file-name ${isTree ? 'is-tree-file-name' : ''}`}>
          {file.name}
          {showDir && <small>{file.directory || 'raiz'}</small>}
        </span>
        <div className={`lists-file-metrics ${isTree ? 'is-tree-metrics' : ''}`}>
          {file.isBinary ? (
            <span className="file-stat-binary">{t('files.binaryBadge')}</span>
          ) : (
            (file.insertions != null || file.deletions != null) && (
              <span
                className="file-stat-diff"
                title={`+${file.insertions ?? 0} / -${file.deletions ?? 0}`}
              >
                {(file.insertions ?? 0) > 0 && (
                  <span className="file-stat-ins">+{file.insertions}</span>
                )}
                {(file.deletions ?? 0) > 0 && (
                  <span className="file-stat-del">-{file.deletions}</span>
                )}
              </span>
            )
          )}
        </div>
      </button>
      {file.area === 'unstaged' && onDiscard && (
        <button
          type="button"
          disabled={disabled}
          className="lists-file-discard-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDiscard();
          }}
          title={t('files.discardFile', { name: file.name })}
          aria-label={t('files.discard')}
        >
          <Undo2 size={isTree ? 11 : 13} />
        </button>
      )}
    </div>
  );
}

function FileGroup({
  title,
  shortTitle,
  files,
  selectedId,
  area,
  disabled,
  isTree,
  collapsed,
  onToggleDir,
  onSelect,
  onStage,
  onAll,
  onDiscard,
  onDiscardAll,
  onContextMenu,
}: {
  title: string;
  shortTitle?: string;
  files: FileEntry[];
  selectedId?: string;
  area: Area;
  disabled: boolean;
  isTree: boolean;
  collapsed: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onSelect: (file: FileEntry) => void;
  onStage: (file: FileEntry) => void;
  onAll: () => void;
  onDiscard?: (file: FileEntry) => void;
  onDiscardAll?: () => void;
  onContextMenu?: (e: React.MouseEvent, file: FileEntry) => void;
}) {
  const treeNodes = useMemo(() => buildTree(files), [files]);
  const visibleItems = useMemo(
    () => (isTree ? flattenTree(treeNodes, collapsed) : []),
    [isTree, treeNodes, collapsed]
  );

  const count = isTree ? visibleItems.length : files.length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowHeight = isTree ? TREE_ROW_HEIGHT : FLAT_ROW_HEIGHT;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [count, virtualizer, isTree]);

  useEffect(() => {
    if (!selectedId) return;
    const idx = isTree
      ? visibleItems.findIndex((item) => !item.isDir && item.file?.id === selectedId)
      : files.findIndex((f) => f.id === selectedId);
    if (idx !== -1) {
      virtualizer.scrollToIndex?.(idx, { align: 'auto' });
    }
  }, [selectedId, isTree, visibleItems, files, virtualizer]);

  const { t } = useI18n();

  const groupStats = useMemo(() => {
    let ins = 0;
    let del = 0;
    for (const f of files) {
      if (f.insertions) ins += f.insertions;
      if (f.deletions) del += f.deletions;
    }
    return { ins, del };
  }, [files]);

  return (
    <div className="lists-file-group">
      <div className="lists-group-header">
        <span className="lists-group-title" title={`${title} (${files.length})`}>
          <span className="lists-group-title-full">{title}</span>
          <span className="lists-group-title-short" aria-hidden="true">{shortTitle ?? title}</span>
          <b className="lists-group-count">{files.length}</b>
          {(groupStats.ins > 0 || groupStats.del > 0) && (
            <span className="lists-group-diff-badges" title={`+${groupStats.ins} / -${groupStats.del}`}>
              {groupStats.ins > 0 && <span className="stat-badge stat-badge-ins">+{groupStats.ins}</span>}
              {groupStats.del > 0 && <span className="stat-badge stat-badge-del">-{groupStats.del}</span>}
            </span>
          )}
        </span>
        {files.length > 0 && (
          <div className="lists-group-header-actions">
            {area === 'unstaged' && onDiscardAll && (
              <button
                type="button"
                disabled={disabled}
                className="lists-text-action lists-text-action-danger"
                onClick={onDiscardAll}
                title={t('files.discardTitle')}
                aria-label={t('files.discardAll')}
              >
                <span className="lists-action-label-full">{t('files.discardAll')}</span>
                <span className="lists-action-label-short" aria-hidden="true">{t('files.discardAllShort')}</span>
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              className="lists-text-action"
              onClick={onAll}
              title={area === 'staged' ? t('files.unstageAll') : t('files.stageAll')}
              aria-label={area === 'staged' ? t('files.unstageAll') : t('files.stageAll')}
            >
              <span className="lists-action-label-full">{area === 'staged' ? t('files.unstageAll') : t('files.stageAll')}</span>
              <span className="lists-action-label-short" aria-hidden="true">{area === 'staged' ? t('files.unstageAllShort') : t('files.stageAllShort')}</span>
            </button>
          </div>
        )}
      </div>
      <div ref={viewportRef} className="lists-file-scroll" tabIndex={0}>
        <div className="lists-virtual-content" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            if (isTree) {
              const node = visibleItems[item.index];
              if (!node) return null;
              if (node.isDir) {
                const isDirCollapsed = collapsed.has(node.fullPath);
                return (
                  <div
                    key={node.id}
                    className="lists-virtual-row lists-tree-row"
                    style={{ transform: `translateY(${item.start}px)`, height: `${TREE_ROW_HEIGHT}px` }}
                  >
                    <button
                      type="button"
                      className="lists-tree-dir-row"
                      style={{ paddingLeft: `${6 + node.depth * 11}px` }}
                      onClick={() => onToggleDir(node.fullPath)}
                    >
                      {isDirCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      {isDirCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                      <span className="lists-tree-dir-name">{node.name}</span>
                    </button>
                  </div>
                );
              }
              const file = node.file!;
              return (
                <div
                  key={file.id}
                  className="lists-virtual-row lists-tree-row"
                  style={{ transform: `translateY(${item.start}px)`, height: `${TREE_ROW_HEIGHT}px` }}
                >
                  <FileRow
                    file={file}
                    selected={file.id === selectedId}
                    canStage
                    disabled={disabled}
                    indent={6 + node.depth * 11}
                    showDir={false}
                    isTree={true}
                    onStage={() => onStage(file)}
                    onSelect={() => onSelect(file)}
                    onDiscard={onDiscard ? () => onDiscard(file) : undefined}
                    onContextMenu={(e) => onContextMenu?.(e, file)}
                  />
                </div>
              );
            }

            const file = files[item.index];
            if (!file) return null;
            return (
              <div
                key={file.id}
                className="lists-virtual-row"
                style={{ transform: `translateY(${item.start}px)`, height: `${FLAT_ROW_HEIGHT}px` }}
              >
                <FileRow
                  file={file}
                  selected={file.id === selectedId}
                  canStage
                  disabled={disabled}
                  indent={0}
                  showDir={true}
                  isTree={false}
                  onStage={() => onStage(file)}
                  onSelect={() => onSelect(file)}
                  onDiscard={onDiscard ? () => onDiscard(file) : undefined}
                  onContextMenu={(e) => onContextMenu?.(e, file)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VirtualHistoryFiles({
  files,
  selectedId,
  isTree,
  collapsed,
  onToggleDir,
  onSelect,
  onContextMenu,
}: {
  files: FileEntry[];
  selectedId?: string;
  isTree: boolean;
  collapsed: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onSelect: (file: FileEntry) => void;
  onContextMenu?: (e: React.MouseEvent, file: FileEntry) => void;
}) {
  const treeNodes = useMemo(() => buildTree(files), [files]);
  const visibleItems = useMemo(
    () => (isTree ? flattenTree(treeNodes, collapsed) : []),
    [isTree, treeNodes, collapsed]
  );

  const count = isTree ? visibleItems.length : files.length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowHeight = isTree ? TREE_ROW_HEIGHT : FLAT_ROW_HEIGHT;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [count, virtualizer, isTree]);

  useEffect(() => {
    if (!selectedId) return;
    const idx = isTree
      ? visibleItems.findIndex((item) => !item.isDir && item.file?.id === selectedId)
      : files.findIndex((f) => f.id === selectedId);
    if (idx !== -1) {
      virtualizer.scrollToIndex?.(idx, { align: 'auto' });
    }
  }, [selectedId, isTree, visibleItems, files, virtualizer]);

  return (
    <div ref={viewportRef} className="lists-file-scroll lists-history-files" tabIndex={0}>
      <div className="lists-virtual-content" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          if (isTree) {
            const node = visibleItems[item.index];
            if (!node) return null;
            if (node.isDir) {
              const isDirCollapsed = collapsed.has(node.fullPath);
              return (
                <div
                  key={node.id}
                  className="lists-virtual-row lists-tree-row"
                  style={{ transform: `translateY(${item.start}px)`, height: `${TREE_ROW_HEIGHT}px` }}
                >
                  <button
                    type="button"
                    className="lists-tree-dir-row"
                    style={{ paddingLeft: `${6 + node.depth * 11}px` }}
                    onClick={() => onToggleDir(node.fullPath)}
                  >
                    {isDirCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    {isDirCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                    <span className="lists-tree-dir-name">{node.name}</span>
                  </button>
                </div>
              );
            }
            const file = node.file!;
            return (
              <div
                key={file.id}
                className="lists-virtual-row lists-tree-row"
                style={{ transform: `translateY(${item.start}px)`, height: `${TREE_ROW_HEIGHT}px` }}
              >
                <FileRow
                  file={file}
                  selected={file.id === selectedId}
                  canStage={false}
                  indent={6 + node.depth * 11}
                  showDir={false}
                  isTree={true}
                  onStage={() => undefined}
                  onSelect={() => onSelect(file)}
                  onContextMenu={(e) => onContextMenu?.(e, file)}
                />
              </div>
            );
          }

          const file = files[item.index];
          if (!file) return null;
          return (
            <div
              key={file.id}
              className="lists-virtual-row"
              style={{ transform: `translateY(${item.start}px)`, height: `${FLAT_ROW_HEIGHT}px` }}
            >
              <FileRow
                file={file}
                selected={file.id === selectedId}
                canStage={false}
                indent={0}
                showDir={true}
                isTree={false}
                onStage={() => undefined}
                onSelect={() => onSelect(file)}
                onContextMenu={(e) => onContextMenu?.(e, file)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FilesPanel() {
  const session = useAppStore((state) => state.session);
  const context = useAppStore((state) => state.context);
  const snapshot = useAppStore((state) => state.snapshot);
  const history = useAppStore((state) => state.history);
  const commitFiles = useAppStore((state) => state.commitFiles);
  const commitStats = useAppStore((state) => state.commitStats);
  const commitDetails = useAppStore((state) => state.commitDetails);
  const selectCommit = useAppStore((state) => state.selectCommit);
  const openFileHistory = useAppStore((state) => state.openFileHistory);
  const selectFile = useAppStore((state) => state.selectFile);
  const runOperation = useAppStore((state) => state.runOperation);
  const operation = useAppStore((state) => state.operation);
  const selectedFile = useAppStore((state) => state.selectedFile);
  const fileViewMode = useAppStore((state) => state.fileViewMode);
  const setFileViewMode = useAppStore((state) => state.setFileViewMode);
  const activePane = useAppStore((state) => state.activePane);
  const setActivePane = useAppStore((state) => state.setActivePane);
  const { t } = useI18n();

  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number;
    y: number;
    file: FileEntry;
  } | null>(null);

  const local = context?.kind === 'local';
  const staged = local ? snapshot?.staged ?? [] : [];
  const unstaged = local ? snapshot?.unstaged ?? [] : [];
  const historical = local ? [] : commitFiles ?? [];
  const totalCount = local ? staged.length + unstaged.length : historical.length;
  const isTree = fileViewMode === 'tree';

  const computedCommitStats = useMemo(() => {
    if (commitStats) return commitStats;
    if (local || historical.length === 0) return null;
    let ins = 0;
    let del = 0;
    for (const f of historical) {
      if (f.insertions) ins += f.insertions;
      if (f.deletions) del += f.deletions;
    }
    return {
      filesChanged: historical.length,
      insertions: ins,
      deletions: del,
    };
  }, [commitStats, local, historical]);

  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedDirs(new Set());
  }, [context?.kind, context?.kind === 'commit' ? context.oid : null]);

  const toggleDir = useCallback((dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const visibleFiles = useMemo(() => {
    if (local) {
      if (isTree) {
        const s = flattenTree(buildTree(staged), collapsedDirs)
          .filter((n) => !n.isDir && n.file)
          .map((n) => n.file!);
        const u = flattenTree(buildTree(unstaged), collapsedDirs)
          .filter((n) => !n.isDir && n.file)
          .map((n) => n.file!);
        return [...s, ...u];
      }
      return [...staged, ...unstaged];
    } else {
      if (isTree) {
        return flattenTree(buildTree(historical), collapsedDirs)
          .filter((n) => !n.isDir && n.file)
          .map((n) => n.file!);
      }
      return historical;
    }
  }, [local, isTree, staged, unstaged, historical, collapsedDirs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (activePane !== 'files') return;

      const activeElement = document.activeElement;
      const tagName = activeElement?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
      if (activeElement?.getAttribute('contenteditable') === 'true') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActivePane('history');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (visibleFiles.length === 0) return;
        const curIdx = visibleFiles.findIndex((f) => f.id === selectedFile?.id);
        const nextIdx = curIdx === -1 ? 0 : Math.min(visibleFiles.length - 1, curIdx + 1);
        if (visibleFiles[nextIdx]) {
          void selectFile(visibleFiles[nextIdx]);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (visibleFiles.length === 0) return;
        const curIdx = visibleFiles.findIndex((f) => f.id === selectedFile?.id);
        const prevIdx = curIdx === -1 ? 0 : Math.max(0, curIdx - 1);
        if (visibleFiles[prevIdx]) {
          void selectFile(visibleFiles[prevIdx]);
        }
      } else if (e.key === ' ' || e.code === 'Space') {
        if (!local || !selectedFile) return;
        e.preventDefault();
        if (selectedFile.area === 'unstaged') {
          void runOperation('stage', [selectedFile.id]);
        } else if (selectedFile.area === 'staged') {
          void runOperation('unstage', [selectedFile.id]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePane, visibleFiles, selectedFile, selectFile, setActivePane, local, runOperation]);

  const handleFileContextMenu = useCallback((e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    void selectFile(file);
    setFileContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
    });
  }, [selectFile]);

  const selectedCommit = useMemo(() => {
    if (context?.kind !== 'commit') return null;
    return (history?.rows ?? []).find((r) => r.commit.oid === context.oid)?.commit ?? null;
  }, [context, history?.rows]);

  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash((cur) => (cur === hash ? null : cur)), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = hash;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash((cur) => (cur === hash ? null : cur)), 1500);
    }
  };

  return (
    <section
      className={`lists-panel lists-files-panel ${activePane === 'files' ? 'is-pane-active' : ''}`}
      aria-label={t('files.localChanges')}
      onClick={() => setActivePane('files')}
    >
      <header className="lists-panel-header">
        <h2>{local ? t('files.localChanges') : t('files.commitFiles')}</h2>
        {local && <span className="lists-header-count">{totalCount}</span>}
      </header>

      {context.kind === 'compare' && (
        <div className="commit-info-card compare-info-card" aria-label="Detalhes da comparação">
          <div className="commit-info-header">
            <div className="commit-info-subject" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Comparando:</span>
              <code>{context.baseOid.slice(0, 8)}</code>
              <span>↔</span>
              <code>{context.targetOid.slice(0, 8)}</code>
            </div>
          </div>
        </div>
      )}

      {context.kind === 'commit' && (selectedCommit || context.oid) && (
        <div className="commit-info-card" aria-label="Detalhes do commit selecionado">
          <div className="commit-info-header">
            <div className="commit-info-subject" title={selectedCommit?.subject ?? context.oid}>
              {selectedCommit?.subject ?? `Commit ${context.oid}`}
            </div>
            <button
              type="button"
              className={`commit-info-hash-btn ${copiedHash === (selectedCommit?.oid ?? context.oid) ? 'is-copied' : ''}`}
              onClick={() => void handleCopyHash(selectedCommit?.oid ?? context.oid)}
              title={t('files.fullHash', { hash: selectedCommit?.oid ?? context.oid })}
            >
              {copiedHash === (selectedCommit?.oid ?? context.oid) ? (
                <>
                  <Check size={12} className="copy-icon-check" />
                  <span>{t('files.copied')}</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <code>{(selectedCommit?.oid ?? context.oid).slice(0, 8)}</code>
                </>
              )}
            </button>
          </div>

          {selectedCommit && (
            <div className="commit-info-meta">
              <span className="commit-info-author" title={`Autor: ${selectedCommit.author}`}>
                <User size={12} className="commit-meta-icon" />
                <strong>{selectedCommit.author}</strong>
              </span>
              <time
                className="commit-info-date"
                dateTime={new Date(selectedCommit.timestamp * 1000).toISOString()}
                title={new Date(selectedCommit.timestamp * 1000).toLocaleString()}
              >
                <Calendar size={12} className="commit-meta-icon" />
                <span>{formatFullDate(selectedCommit.timestamp)}</span>
              </time>
            </div>
          )}

          {commitDetails && (commitDetails.committerName !== commitDetails.authorName || commitDetails.committerTimestamp !== commitDetails.authorTimestamp) && (
            <div className="commit-info-committer" title={`${commitDetails.committerName} <${commitDetails.committerEmail}>`}>
              <span className="commit-info-committer-label">{t('files.committer')}</span>
              <strong>{commitDetails.committerName}</strong>
            </div>
          )}

          {commitDetails?.parents && commitDetails.parents.length > 0 && (
            <div className="commit-info-parents">
              <span className="commit-info-parents-label">{t('files.parents')}</span>
              <div className="commit-info-parents-list">
                {commitDetails.parents.map((parent) => (
                  <button
                    key={parent}
                    type="button"
                    className="commit-parent-badge"
                    onClick={() => void selectCommit(parent)}
                    title={`${t('diff.clickToSelectCommit')}: ${parent}`}
                  >
                    <code>{parent.slice(0, 8)}</code>
                  </button>
                ))}
              </div>
            </div>
          )}

          {commitDetails?.body && commitDetails.body.trim().length > 0 && (
            <div className="commit-info-body">
              <pre>{commitDetails.body.trim()}</pre>
            </div>
          )}

        </div>
      )}

      <div className="commit-files-toolbar">
        <span className="commit-files-count">{t('files.statsSummary', { count: totalCount })}</span>
        <div className="commit-files-toolbar-actions">
          {!local && computedCommitStats && (
            <div className="commit-stats-badges">
              {computedCommitStats.insertions > 0 && <span className="stat-badge stat-badge-ins">+{computedCommitStats.insertions}</span>}
              {computedCommitStats.deletions > 0 && <span className="stat-badge stat-badge-del">-{computedCommitStats.deletions}</span>}
            </div>
          )}
          <div className="view-mode-switch" role="group" aria-label="Modo de visualização dos arquivos">
            <button type="button" className={!isTree ? 'active' : ''} onClick={() => setFileViewMode('flat')} title={t('files.flatList')} aria-label={t('files.flatList')}>
              <List size={13} />
            </button>
            <button type="button" className={isTree ? 'active' : ''} onClick={() => setFileViewMode('tree')} title={t('files.treeList')} aria-label={t('files.treeList')}>
              <FolderTree size={13} />
            </button>
          </div>
        </div>
      </div>

      {local ? (
        <>
          <FileGroup
            title={t('files.staged')}
            shortTitle={t('files.stagedShort')}
            files={staged}
            selectedId={selectedFile?.id}
            area="staged"
            disabled={Boolean(operation)}
            isTree={isTree}
            collapsed={collapsedDirs}
            onToggleDir={toggleDir}
            onSelect={selectFile}
            onStage={(file) => runOperation('unstage', [file.id])}
            onAll={() => runOperation('unstageAll')}
            onContextMenu={handleFileContextMenu}
          />
          <FileGroup
            title={t('files.unstaged')}
            shortTitle={t('files.unstagedShort')}
            files={unstaged}
            selectedId={selectedFile?.id}
            area="unstaged"
            disabled={Boolean(operation)}
            isTree={isTree}
            collapsed={collapsedDirs}
            onToggleDir={toggleDir}
            onSelect={selectFile}
            onStage={(file) => runOperation('stage', [file.id])}
            onAll={() => runOperation('stageAll')}
            onContextMenu={handleFileContextMenu}
            onDiscard={(file) => {
              if (
                window.confirm(
                  t('files.discardConfirmFile', { name: file.name })
                )
              ) {
                void runOperation('discard', [file.id]);
              }
            }}
            onDiscardAll={() => {
              if (
                window.confirm(
                  t('files.discardConfirmAll', { count: unstaged.length })
                )
              ) {
                void runOperation('discardAll');
              }
            }}
          />
        </>
      ) : (
        <VirtualHistoryFiles
          files={historical}
          selectedId={selectedFile?.id}
          isTree={isTree}
          collapsed={collapsedDirs}
          onToggleDir={toggleDir}
          onSelect={selectFile}
          onContextMenu={handleFileContextMenu}
        />
      )}

      {fileContextMenu && (
        <FileContextMenu
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          file={fileContextMenu.file}
          repoPath={session?.root}
          onClose={() => setFileContextMenu(null)}
          onStage={(id) => void runOperation('stage', [id])}
          onUnstage={(id) => void runOperation('unstage', [id])}
          onDiscard={(id) => void runOperation('discard', [id])}
          onIgnore={(pattern) => void runOperation('ignorePath', [], pattern)}
          onOpenEditor={(p) => void runOperation('openEditor', [], p)}
          onRevealFile={(p) => void runOperation('revealFile', [], p)}
          onViewHistory={(p) => openFileHistory(p)}
        />
      )}
    </section>
  );
}
