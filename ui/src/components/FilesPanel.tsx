import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FolderMinus,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Globe,
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
import { DirContextMenu } from './DirContextMenu';
import { FileExplorer } from './FileExplorer';
import './Lists.css';

const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});
const fullTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const fullDateCache = new Map<number, string>();

export function formatFullDate(timestamp: number): string {
  const cached = fullDateCache.get(timestamp);
  if (cached !== undefined) return cached;
  const d = new Date(timestamp * 1000);
  const formatted = `${fullDateFormatter.format(d)} às ${fullTimeFormatter.format(d)}`;
  if (fullDateCache.size > 500) fullDateCache.clear();
  fullDateCache.set(timestamp, formatted);
  return formatted;
}

const FLAT_ROW_HEIGHT = 36;
const TREE_ROW_HEIGHT = 25;
// Keep the visible-files memo stable while only the selection changes.
const EMPTY_FILES: FileEntry[] = [];
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
  descendantFiles?: FileEntry[];
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
    const parts = file.pathDisplay.replace(/\\/g, '/').split('/');
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

  function convert(level: Map<string, MutableNode>, depth: number): { nodes: FileTreeNode[]; allFiles: FileEntry[] } {
    const nodes: FileTreeNode[] = [];
    const allFiles: FileEntry[] = [];
    const dirs: MutableNode[] = [];
    const leaves: MutableNode[] = [];

    for (const node of level.values()) {
      if (node.isDir) dirs.push(node);
      else leaves.push(node);
    }

    dirs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    leaves.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const dir of dirs) {
      const converted = convert(dir.children!, depth + 1);
      nodes.push({
        id: dir.id,
        name: dir.name,
        fullPath: dir.fullPath,
        depth,
        isDir: true,
        children: converted.nodes,
        descendantFiles: converted.allFiles,
      });
      for (let i = 0; i < converted.allFiles.length; i++) {
        allFiles.push(converted.allFiles[i]);
      }
    }

    for (const leaf of leaves) {
      const file = leaf.file!;
      nodes.push({
        id: file.id,
        name: file.name,
        fullPath: file.pathDisplay,
        depth,
        isDir: false,
        file,
      });
      allFiles.push(file);
    }
    return { nodes, allFiles };
  }

  return convert(root, 0).nodes;
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

export function getDescendantFiles(node: FileTreeNode): FileEntry[] {
  if (node.descendantFiles) return node.descendantFiles;
  const result: FileEntry[] = [];
  function traverse(n: FileTreeNode) {
    if (!n.isDir && n.file) {
      result.push(n.file);
    } else if (n.isDir && n.children) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }
  traverse(node);
  return result;
}

export function DiscardButton({
  disabled = false,
  size = 13,
  onDiscard,
  title,
  confirmTitle,
  ariaLabel,
  confirmAriaLabel,
}: {
  disabled?: boolean;
  size?: number;
  onDiscard: () => void;
  title: string;
  confirmTitle: string;
  ariaLabel: string;
  confirmAriaLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirming(false);
      onDiscard();
    } else {
      setConfirming(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setConfirming(false);
      }, 3500);
    }
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(false);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={`lists-file-discard-btn ${confirming ? 'is-confirming' : ''}`}
      onClick={handleClick}
      onBlur={handleBlur}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      title={confirming ? confirmTitle : title}
      aria-label={confirming ? confirmAriaLabel : ariaLabel}
    >
      {confirming ? <Check size={size} strokeWidth={2.5} /> : <Undo2 size={size} />}
    </button>
  );
}

const FileRow = memo(function FileRow({
  file,
  selected = false,
  canStage,
  disabled = false,
  indent = 0,
  showDir = true,
  isTree = false,
  onStage,
  onSelect,
  onPrefetch,
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
  onStage: (file: FileEntry) => void;
  onSelect: (file: FileEntry) => void;
  onPrefetch?: (file: FileEntry) => void;
  onDiscard?: (file: FileEntry) => void;
  onContextMenu?: (e: React.MouseEvent, file: FileEntry) => void;
}) {
  const { t } = useI18n();
  const Icon = statusGlyph[file.status];
  const statusText = t(`files.status.${file.status}`);
  const actionText = file.area === 'staged' ? t('files.unstageFile') : t('files.stageFile');
  return (
    <div
      className={`lists-file-row ${isTree ? 'is-tree-file-row' : ''}`}
      style={{ paddingLeft: `${indent}px` }}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, file) : undefined}
      onDoubleClick={() => {
        if (canStage && !disabled) {
          onStage(file);
        }
      }}
    >
      {canStage && (
        <input
          className={`lists-stage-checkbox ${isTree ? 'is-tree-checkbox' : ''}`}
          type="checkbox"
          disabled={disabled}
          checked={file.area === 'staged'}
          onChange={() => onStage(file)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${file.name}: ${actionText}`}
        />
      )}
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        className={`lists-file-select ${selected ? 'lists-row-selected' : ''} ${isTree ? 'is-tree-select' : ''}`}
        onPointerEnter={onPrefetch ? () => onPrefetch(file) : undefined}
        onFocus={onPrefetch ? () => onPrefetch(file) : undefined}
        onClick={(e) => {
          onSelect(file);
          (e.currentTarget as HTMLElement).blur();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (canStage && !disabled) {
            onStage(file);
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
        <DiscardButton
          disabled={disabled}
          size={isTree ? 11 : 13}
          onDiscard={() => onDiscard(file)}
          title={t('files.discardFile', { name: file.name })}
          confirmTitle={t('files.confirmDiscard')}
          ariaLabel={t('files.discard')}
          confirmAriaLabel={t('files.confirmDiscard')}
        />
      )}
    </div>
  );
});

const NOOP_STAGE = () => undefined;

export const DirRow = memo(function DirRow({
  node,
  descendantFiles,
  isCollapsed,
  area,
  disabled = false,
  onToggle,
  onStage,
  onUnstage,
  onDiscard,
  onContextMenu,
}: {
  node: FileTreeNode;
  descendantFiles: FileEntry[];
  isCollapsed: boolean;
  area?: Area;
  disabled?: boolean;
  onToggle: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { t } = useI18n();

  return (
    <div
      className="lists-tree-dir-container"
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        className="lists-tree-dir-row"
        style={{ paddingLeft: `${6 + node.depth * 11}px` }}
        onClick={onToggle}
        title={node.fullPath}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        {isCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
        <span className="lists-tree-dir-name">{node.name}</span>
        <span className="lists-tree-dir-count">({descendantFiles.length})</span>
      </button>
      <div className="lists-dir-actions" onClick={(e) => e.stopPropagation()}>
        {area === 'unstaged' && onStage && (
          <button
            type="button"
            disabled={disabled}
            className="lists-dir-action-btn lists-dir-stage-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStage();
            }}
            title={t('files.stageDir', { name: node.name })}
            aria-label={t('files.stageDir', { name: node.name })}
          >
            <FolderPlus size={12} />
          </button>
        )}
        {area === 'staged' && onUnstage && (
          <button
            type="button"
            disabled={disabled}
            className="lists-dir-action-btn lists-dir-unstage-btn"
            onClick={(e) => {
              e.stopPropagation();
              onUnstage();
            }}
            title={t('files.unstageDir', { name: node.name })}
            aria-label={t('files.unstageDir', { name: node.name })}
          >
            <FolderMinus size={12} />
          </button>
        )}
        {area === 'unstaged' && onDiscard && (
          <DiscardButton
            disabled={disabled}
            size={11}
            onDiscard={onDiscard}
            title={t('files.discardDir', { name: node.name })}
            confirmTitle={t('files.confirmDiscardDir', { name: node.name })}
            ariaLabel={t('files.discardDir', { name: node.name })}
            confirmAriaLabel={t('files.confirmDiscardDir', { name: node.name })}
          />
        )}
      </div>
    </div>
  );
});

const FileGroup = memo(function FileGroup({
  title,
  shortTitle,
  files,
  selectedId,
  area,
  disabled,
  isTree,
  visibleItems: precomputedVisibleItems,
  collapsed,
  onToggleDir,
  onSelect,
  onPrefetch,
  onStage,
  onAll,
  onDiscard,
  onDiscardAll,
  onStageDir,
  onUnstageDir,
  onDiscardDir,
  onContextMenu,
  onDirContextMenu,
}: {
  title: string;
  shortTitle?: string;
  files: FileEntry[];
  selectedId?: string;
  area: Area;
  disabled: boolean;
  isTree: boolean;
  visibleItems?: FileTreeNode[];
  collapsed: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onSelect: (file: FileEntry) => void;
  onPrefetch?: (file: FileEntry) => void;
  onStage: (file: FileEntry) => void;
  onAll: () => void;
  onDiscard?: (file: FileEntry) => void;
  onDiscardAll?: () => void;
  onStageDir?: (files: FileEntry[]) => void;
  onUnstageDir?: (files: FileEntry[]) => void;
  onDiscardDir?: (files: FileEntry[]) => void;
  onContextMenu?: (e: React.MouseEvent, file: FileEntry) => void;
  onDirContextMenu?: (e: React.MouseEvent, node: FileTreeNode, descendantFiles: FileEntry[], area: Area) => void;
}) {
  const treeNodes = useMemo(
    () => (isTree && !precomputedVisibleItems ? buildTree(files) : []),
    [isTree, precomputedVisibleItems, files]
  );
  const visibleItems = useMemo(
    () => (precomputedVisibleItems ?? (isTree ? flattenTree(treeNodes, collapsed) : [])),
    [precomputedVisibleItems, isTree, treeNodes, collapsed]
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
                const descendantFiles = getDescendantFiles(node);
                return (
                  <div
                    key={node.id}
                    className="lists-virtual-row lists-tree-row"
                    style={{ transform: `translate3d(0, ${item.start}px, 0)`, height: `${TREE_ROW_HEIGHT}px` }}
                  >
                    <DirRow
                      node={node}
                      descendantFiles={descendantFiles}
                      isCollapsed={isDirCollapsed}
                      area={area}
                      disabled={disabled}
                      onToggle={() => onToggleDir(node.fullPath)}
                      onStage={onStageDir ? () => onStageDir(descendantFiles) : undefined}
                      onUnstage={onUnstageDir ? () => onUnstageDir(descendantFiles) : undefined}
                      onDiscard={onDiscardDir ? () => onDiscardDir(descendantFiles) : undefined}
                      onContextMenu={(e) => onDirContextMenu?.(e, node, descendantFiles, area)}
                    />
                  </div>
                );
              }
              const file = node.file!;
              return (
                <div
                  key={file.id}
                  className="lists-virtual-row lists-tree-row"
                  style={{ transform: `translate3d(0, ${item.start}px, 0)`, height: `${TREE_ROW_HEIGHT}px` }}
                >
                  <FileRow
                    file={file}
                    selected={file.id === selectedId}
                    canStage
                    disabled={disabled}
                    indent={6 + node.depth * 11}
                    showDir={false}
                    isTree={true}
                    onStage={onStage}
                    onSelect={onSelect}
                    onPrefetch={onPrefetch}
                    onDiscard={onDiscard}
                    onContextMenu={onContextMenu}
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
                style={{ transform: `translate3d(0, ${item.start}px, 0)`, height: `${FLAT_ROW_HEIGHT}px` }}
              >
                <FileRow
                  file={file}
                  selected={file.id === selectedId}
                  canStage
                  disabled={disabled}
                  indent={0}
                  showDir={true}
                  isTree={false}
                  onStage={onStage}
                  onSelect={onSelect}
                  onPrefetch={onPrefetch}
                  onDiscard={onDiscard}
                  onContextMenu={onContextMenu}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

const VirtualHistoryFiles = memo(function VirtualHistoryFiles({
  files,
  selectedId,
  isTree,
  visibleItems: precomputedVisibleItems,
  collapsed,
  onToggleDir,
  onSelect,
  onPrefetch,
  onContextMenu,
  onDirContextMenu,
}: {
  files: FileEntry[];
  selectedId?: string;
  isTree: boolean;
  visibleItems?: FileTreeNode[];
  collapsed: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onSelect: (file: FileEntry) => void;
  onPrefetch?: (file: FileEntry) => void;
  onContextMenu?: (e: React.MouseEvent, file: FileEntry) => void;
  onDirContextMenu?: (e: React.MouseEvent, node: FileTreeNode, descendantFiles: FileEntry[], area: Area) => void;
}) {
  const treeNodes = useMemo(
    () => (isTree && !precomputedVisibleItems ? buildTree(files) : []),
    [isTree, precomputedVisibleItems, files]
  );
  const visibleItems = useMemo(
    () => (precomputedVisibleItems ?? (isTree ? flattenTree(treeNodes, collapsed) : [])),
    [precomputedVisibleItems, isTree, treeNodes, collapsed]
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
              const descendantFiles = getDescendantFiles(node);
              return (
                <div
                  key={node.id}
                  className="lists-virtual-row lists-tree-row"
                  style={{ transform: `translate3d(0, ${item.start}px, 0)`, height: `${TREE_ROW_HEIGHT}px` }}
                >
                  <DirRow
                    node={node}
                    descendantFiles={descendantFiles}
                    isCollapsed={isDirCollapsed}
                    area="commit"
                    disabled={false}
                    onToggle={() => onToggleDir(node.fullPath)}
                    onContextMenu={(e) => onDirContextMenu?.(e, node, descendantFiles, 'commit')}
                  />
                </div>
              );
            }
            const file = node.file!;
            return (
              <div
                key={file.id}
                className="lists-virtual-row lists-tree-row"
                style={{ transform: `translate3d(0, ${item.start}px, 0)`, height: `${TREE_ROW_HEIGHT}px` }}
              >
                <FileRow
                  file={file}
                  selected={file.id === selectedId}
                  canStage={false}
                  indent={6 + node.depth * 11}
                  showDir={false}
                  isTree={true}
                  onStage={NOOP_STAGE}
                  onSelect={onSelect}
                  onPrefetch={onPrefetch}
                  onContextMenu={onContextMenu}
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
              style={{ transform: `translate3d(0, ${item.start}px, 0)`, height: `${FLAT_ROW_HEIGHT}px` }}
            >
              <FileRow
                file={file}
                selected={file.id === selectedId}
                canStage={false}
                indent={0}
                showDir={true}
                isTree={false}
                onStage={NOOP_STAGE}
                onSelect={onSelect}
                onPrefetch={onPrefetch}
                onContextMenu={onContextMenu}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const FilesPanel = memo(function FilesPanel() {
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
  const prefetchFile = useAppStore((state) => state.prefetchFile);
  const runOperation = useAppStore((state) => state.runOperation);
  const operation = useAppStore((state) => state.operation);
  const selectedFile = useAppStore((state) => state.selectedFile);
  const previewFileId = useAppStore((state) => state.preview?.fileId ?? null);
  const fileViewMode = useAppStore((state) => state.fileViewMode);
  const setFileViewMode = useAppStore((state) => state.setFileViewMode);
  const activePane = useAppStore((state) => state.activePane);
  const setActivePane = useAppStore((state) => state.setActivePane);
  const filesTab = useAppStore((state) => state.filesTab);
  const setFilesTab = useAppStore((state) => state.setFilesTab);
  const openInBrowser = useAppStore((state) => state.openInBrowser);
  const restoreCommitFile = useAppStore((state) => state.restoreCommitFile);
  const resolveConflict = useAppStore((state) => state.resolveConflict);
  const setBlameOpen = useAppStore((state) => state.setBlameOpen);
  const { t } = useI18n();

  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number;
    y: number;
    file: FileEntry;
  } | null>(null);

  const [dirContextMenu, setDirContextMenu] = useState<{
    x: number;
    y: number;
    dirName: string;
    dirPath: string;
    files: FileEntry[];
    area?: Area;
  } | null>(null);

  const handleDirContextMenu = useCallback(
    (e: React.MouseEvent, node: FileTreeNode, descendantFiles: FileEntry[], area: Area) => {
      e.preventDefault();
      e.stopPropagation();
      setDirContextMenu({
        x: e.clientX,
        y: e.clientY,
        dirName: node.name,
        dirPath: node.fullPath,
        files: descendantFiles,
        area,
      });
    },
    []
  );

  const local = context?.kind === 'local';
  const staged = local ? snapshot?.staged ?? EMPTY_FILES : EMPTY_FILES;
  const unstaged = local ? snapshot?.unstaged ?? EMPTY_FILES : EMPTY_FILES;
  const historical = local ? EMPTY_FILES : commitFiles ?? EMPTY_FILES;
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

  const contextCommitOid = context?.kind === 'commit' ? context.oid : null;

  useEffect(() => {
    setCollapsedDirs(new Set());
  }, [context?.kind, contextCommitOid]);

  const toggleDir = useCallback((dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const stagedTree = useMemo(() => (local && isTree ? buildTree(staged) : []), [local, isTree, staged]);
  const unstagedTree = useMemo(() => (local && isTree ? buildTree(unstaged) : []), [local, isTree, unstaged]);
  const historicalTree = useMemo(() => (!local && isTree ? buildTree(historical) : []), [local, isTree, historical]);

  const stagedVisibleItems = useMemo(
    () => (local && isTree ? flattenTree(stagedTree, collapsedDirs) : []),
    [local, isTree, stagedTree, collapsedDirs]
  );
  const unstagedVisibleItems = useMemo(
    () => (local && isTree ? flattenTree(unstagedTree, collapsedDirs) : []),
    [local, isTree, unstagedTree, collapsedDirs]
  );
  const historicalVisibleItems = useMemo(
    () => (!local && isTree ? flattenTree(historicalTree, collapsedDirs) : []),
    [local, isTree, historicalTree, collapsedDirs]
  );

  const visibleFiles = useMemo(() => {
    if (local) {
      if (isTree) {
        const result: FileEntry[] = [];
        for (let i = 0; i < stagedVisibleItems.length; i++) {
          const n = stagedVisibleItems[i];
          if (!n.isDir && n.file) result.push(n.file);
        }
        for (let i = 0; i < unstagedVisibleItems.length; i++) {
          const n = unstagedVisibleItems[i];
          if (!n.isDir && n.file) result.push(n.file);
        }
        return result;
      }
      return [...staged, ...unstaged];
    } else {
      if (isTree) {
        const result: FileEntry[] = [];
        for (let i = 0; i < historicalVisibleItems.length; i++) {
          const n = historicalVisibleItems[i];
          if (!n.isDir && n.file) result.push(n.file);
        }
        return result;
      }
      return historical;
    }
  }, [local, isTree, staged, unstaged, historical, stagedVisibleItems, unstagedVisibleItems, historicalVisibleItems]);

  useEffect(() => {
    if (!selectedFile || previewFileId !== selectedFile.id) return;
    const index = visibleFiles.findIndex((file) => file.id === selectedFile.id && file.area === selectedFile.area);
    if (index < 0) return;
    if (visibleFiles[index + 1]) prefetchFile(visibleFiles[index + 1]);
    if (visibleFiles[index - 1]) prefetchFile(visibleFiles[index - 1]);
  }, [selectedFile?.id, selectedFile?.area, previewFileId, visibleFiles, prefetchFile]);

  const navRef = useRef({
    activePane,
    filesTab,
    visibleFiles,
    selectFile,
    setActivePane,
    local,
    runOperation,
  });
  navRef.current = {
    activePane,
    filesTab,
    visibleFiles,
    selectFile,
    setActivePane,
    local,
    runOperation,
  };

  useEffect(() => {
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    let previewDeferred = false;
    let previewInFlight = false;
    const pressedArrows = new Set<string>();
    const schedulePreview = () => {
      if (previewTimer !== null || previewInFlight || !previewDeferred) return;
      previewTimer = setTimeout(() => {
        previewTimer = null;
        if (!previewDeferred) return;
        previewDeferred = false;
        const file = useAppStore.getState().selectedFile;
        if (!file) return;
        previewInFlight = true;
        void navRef.current.selectFile(file).finally(() => {
          previewInFlight = false;
          if (pressedArrows.size > 0) schedulePreview();
        });
      }, 70);
    };
    const flushPreview = () => {
      if (previewTimer !== null) clearTimeout(previewTimer);
      previewTimer = null;
      if (!previewDeferred) return;
      previewDeferred = false;
      const file = useAppStore.getState().selectedFile;
      if (file) void navRef.current.selectFile(file);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const {
        activePane: curPane,
        filesTab: propTab,
        visibleFiles: curVisibleFiles,
        selectFile: curSelectFile,
        setActivePane: curSetActivePane,
        local: isLocal,
        runOperation: curRunOperation,
      } = navRef.current;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (curPane !== 'files') return;
      if (document.querySelector('.modal-backdrop')) return;

      const activeElement = document.activeElement;
      if (
        activeElement &&
        !(activeElement.closest?.('.monaco-editor') && !activeElement.closest?.('.find-widget'))
      ) {
        const tagName = activeElement.tagName?.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
        if (activeElement.getAttribute?.('contenteditable') === 'true') return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        curSetActivePane('history');
        return;
      }

      const currentTab = useAppStore.getState().filesTab ?? propTab;
      if (currentTab === 'explorer') return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (e.repeat && !pressedArrows.has(e.key)) return;
        pressedArrows.add(e.key);
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (curVisibleFiles.length === 0) return;
        const currentFile = useAppStore.getState().selectedFile;
        const curIdx = curVisibleFiles.findIndex((f) => f.id === currentFile?.id && f.area === currentFile?.area);
        const nextIdx = curIdx === -1 ? 0 : Math.min(curVisibleFiles.length - 1, curIdx + 1);
        if (curVisibleFiles[nextIdx] && nextIdx !== curIdx) {
          if (e.repeat) {
            previewDeferred = true;
            schedulePreview();
          } else {
            previewDeferred = false;
            if (previewTimer !== null) clearTimeout(previewTimer);
            previewTimer = null;
          }
          if (e.repeat) void curSelectFile(curVisibleFiles[nextIdx], { deferPreview: true });
          else void curSelectFile(curVisibleFiles[nextIdx]);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (curVisibleFiles.length === 0) return;
        const currentFile = useAppStore.getState().selectedFile;
        const curIdx = curVisibleFiles.findIndex((f) => f.id === currentFile?.id && f.area === currentFile?.area);
        const prevIdx = curIdx === -1 ? 0 : Math.max(0, curIdx - 1);
        if (curVisibleFiles[prevIdx] && prevIdx !== curIdx) {
          if (e.repeat) {
            previewDeferred = true;
            schedulePreview();
          } else {
            previewDeferred = false;
            if (previewTimer !== null) clearTimeout(previewTimer);
            previewTimer = null;
          }
          if (e.repeat) void curSelectFile(curVisibleFiles[prevIdx], { deferPreview: true });
          else void curSelectFile(curVisibleFiles[prevIdx]);
        }
      } else if (e.key === ' ' || e.code === 'Space') {
        const currentFile = useAppStore.getState().selectedFile;
        if (!isLocal || !currentFile) return;
        e.preventDefault();
        if (currentFile.area === 'unstaged') {
          void curRunOperation('stage', [currentFile.id]);
        } else if (currentFile.area === 'staged') {
          void curRunOperation('unstage', [currentFile.id]);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        pressedArrows.delete(e.key);
        flushPreview();
      }
    };
    const handleBlur = () => {
      pressedArrows.clear();
      flushPreview();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      pressedArrows.clear();
      previewDeferred = false;
      if (previewTimer !== null) clearTimeout(previewTimer);
    };
  }, []);

  const handleUnstageFile = useCallback((file: FileEntry) => {
    void runOperation('unstage', [file.id]);
  }, [runOperation]);

  const handleStageFile = useCallback((file: FileEntry) => {
    void runOperation('stage', [file.id]);
  }, [runOperation]);

  const handleDiscardFile = useCallback((file: FileEntry) => {
    void runOperation('discard', [file.id]);
  }, [runOperation]);

  const handleUnstageAll = useCallback(() => {
    void runOperation('unstageAll');
  }, [runOperation]);

  const handleStageAll = useCallback(() => {
    void runOperation('stageAll');
  }, [runOperation]);

  const unstagedCount = unstaged.length;
  const handleDiscardAll = useCallback(() => {
    if (window.confirm(t('files.discardConfirmAll', { count: unstagedCount }))) {
      void runOperation('discardAll');
    }
  }, [t, unstagedCount, runOperation]);

  const handleUnstageDir = useCallback((files: FileEntry[]) => {
    void runOperation('unstage', files.map((f) => f.id));
  }, [runOperation]);

  const handleStageDir = useCallback((files: FileEntry[]) => {
    void runOperation('stage', files.map((f) => f.id));
  }, [runOperation]);

  const handleDiscardDir = useCallback((files: FileEntry[]) => {
    void runOperation('discard', files.map((f) => f.id));
  }, [runOperation]);

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
    if (!contextCommitOid) return null;
    return (history?.rows ?? []).find((r) => r.commit.oid === contextCommitOid)?.commit ?? null;
  }, [contextCommitOid, history?.rows]);

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
      aria-label={filesTab === 'explorer' ? t('files.explorer') : (local ? t('files.localChanges') : t('files.commitFiles'))}
      onClick={() => setActivePane('files')}
    >
      <header className="lists-panel-header files-panel-header-with-tabs">
        <div className="files-mode-tabs" role="tablist" aria-label="Abas de arquivos">
          <button
            type="button"
            role="tab"
            aria-selected={filesTab !== 'explorer'}
            className={`files-mode-tab ${filesTab !== 'explorer' ? 'active' : ''}`}
            onClick={() => setFilesTab('changes')}
          >
            <span>{local ? t('files.localChanges') : t('files.commitFiles')}</span>
            {local && totalCount > 0 && <span className="lists-header-count">{totalCount}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filesTab === 'explorer'}
            className={`files-mode-tab ${filesTab === 'explorer' ? 'active' : ''}`}
            onClick={() => setFilesTab('explorer')}
          >
            <span>{t('files.explorer')}</span>
          </button>
        </div>
      </header>

      {filesTab === 'explorer' ? (
        <FileExplorer />
      ) : (
        <>
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
            <div className="commit-info-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                className="commit-info-hash-btn"
                onClick={() => void openInBrowser?.({ commitOid: selectedCommit?.oid ?? context.oid })}
                title={t('fileMenu.openCommitInBrowser')}
                aria-label={t('fileMenu.openCommitInBrowser')}
              >
                <Globe size={12} />
              </button>
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
            visibleItems={stagedVisibleItems}
            collapsed={collapsedDirs}
            onToggleDir={toggleDir}
            onSelect={selectFile}
            onPrefetch={prefetchFile}
            onStage={handleUnstageFile}
            onAll={handleUnstageAll}
            onUnstageDir={handleUnstageDir}
            onContextMenu={handleFileContextMenu}
            onDirContextMenu={handleDirContextMenu}
          />
          <FileGroup
            title={t('files.unstaged')}
            shortTitle={t('files.unstagedShort')}
            files={unstaged}
            selectedId={selectedFile?.id}
            area="unstaged"
            disabled={Boolean(operation)}
            isTree={isTree}
            visibleItems={unstagedVisibleItems}
            collapsed={collapsedDirs}
            onToggleDir={toggleDir}
            onSelect={selectFile}
            onPrefetch={prefetchFile}
            onStage={handleStageFile}
            onAll={handleStageAll}
            onStageDir={handleStageDir}
            onDiscardDir={handleDiscardDir}
            onDiscard={handleDiscardFile}
            onDiscardAll={handleDiscardAll}
            onContextMenu={handleFileContextMenu}
            onDirContextMenu={handleDirContextMenu}
          />
        </>
      ) : (
        <VirtualHistoryFiles
          files={historical}
          selectedId={selectedFile?.id}
          isTree={isTree}
          visibleItems={historicalVisibleItems}
          collapsed={collapsedDirs}
          onToggleDir={toggleDir}
          onSelect={selectFile}
          onPrefetch={prefetchFile}
          onContextMenu={handleFileContextMenu}
          onDirContextMenu={handleDirContextMenu}
        />
      )}

      {fileContextMenu && (
        <FileContextMenu
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          file={fileContextMenu.file}
          repoPath={session?.root}
          commitOid={context.kind === 'commit' ? context.oid : null}
          onClose={() => setFileContextMenu(null)}
          onStage={(id) => void runOperation('stage', [id])}
          onUnstage={(id) => void runOperation('unstage', [id])}
          onDiscard={(id) => void runOperation('discard', [id])}
          onIgnore={(pattern) => void runOperation('ignorePath', [], pattern)}
          onOpenEditor={(p) => void runOperation('openEditor', [], p)}
          onRevealFile={(p) => void runOperation('revealFile', [], p)}
          onViewHistory={(p) => openFileHistory(p)}
          onRestoreCommitFile={(oid, path) => void restoreCommitFile?.(oid, path)}
          onViewBlame={(_p, _oid) => setBlameOpen(true)}
          onOpenBrowser={(p, oid) => void openInBrowser?.({ commitOid: oid, filePath: p })}
          onResolveConflict={(path, choice) => void resolveConflict(path, choice)}
        />
      )}

      {dirContextMenu && (
        <DirContextMenu
          x={dirContextMenu.x}
          y={dirContextMenu.y}
          dirName={dirContextMenu.dirName}
          dirPath={dirContextMenu.dirPath}
          files={dirContextMenu.files}
          area={dirContextMenu.area}
          repoPath={session?.root}
          onClose={() => setDirContextMenu(null)}
          onStage={(files) => void runOperation('stage', files.map((f) => f.id))}
          onUnstage={(files) => void runOperation('unstage', files.map((f) => f.id))}
          onDiscard={(files) => void runOperation('discard', files.map((f) => f.id))}
          onOpenEditor={(p) => void runOperation('openEditor', [], p)}
          onRevealFile={(p) => void runOperation('revealFile', [], p)}
        />
      )}
        </>
      )}
    </section>
  );
});
