import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Code2,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  History,
  List,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';
import { getBridge } from '../lib/bridge';
import type { Area, FileEntry, RepoFileEntry } from '../lib/types';
import { buildTree, flattenTree, getDescendantFiles } from './FilesPanel';
import { FileContextMenu } from './FileContextMenu';
import { DirContextMenu } from './DirContextMenu';
import './Lists.css';

const FLAT_ROW_HEIGHT = 36;
const TREE_ROW_HEIGHT = 26;

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'rs', 'py', 'go', 'c', 'cpp', 'h', 'hpp', 'java',
  'json', 'toml', 'yaml', 'yml', 'html', 'css', 'scss', 'sass', 'less', 'vue',
  'svelte', 'sh', 'bash', 'zsh', 'sql', 'graphql', 'md', 'xml', 'php', 'rb',
  'swift', 'kt', 'kts', 'dart', 'scala', 'cs',
]);

function fileIconFor(path: string) {
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
  return CODE_EXTENSIONS.has(ext) ? FileCode : FileText;
}

export const FileExplorer = memo(function FileExplorer() {
  const { t } = useI18n();
  const session = useAppStore((state) => state.session);
  const context = useAppStore((state) => state.context);
  const snapshot = useAppStore((state) => state.snapshot);
  const selectedFile = useAppStore((state) => state.selectedFile);
  const selectFile = useAppStore((state) => state.selectFile);
  const preview = useAppStore((state) => state.preview);
  const prefetchFile = useAppStore((state) => state.prefetchFile);
  const openFileHistory = useAppStore((state) => state.openFileHistory);
  const runOperation = useAppStore((state) => state.runOperation);
  const setBlameOpen = useAppStore((state) => state.setBlameOpen);
  const fileViewMode = useAppStore((state) => state.fileViewMode);
  const setFileViewMode = useAppStore((state) => state.setFileViewMode);
  const activePane = useAppStore((state) => state.activePane);
  const setActivePane = useAppStore((state) => state.setActivePane);
  const filesTab = useAppStore((state) => state.filesTab);
  const refreshing = useAppStore((state) => state.refreshing);
  const openInBrowser = useAppStore((state) => state.openInBrowser);
  const restoreCommitFile = useAppStore((state) => state.restoreCommitFile);

  const [rawFiles, setRawFiles] = useState<RepoFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [scope, setScope] = useState<'worktree' | 'commit'>('worktree');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

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

  const fileContextMenuRef = useRef(fileContextMenu);
  fileContextMenuRef.current = fileContextMenu;
  const dirContextMenuRef = useRef(dirContextMenu);
  dirContextMenuRef.current = dirContextMenu;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const commitOid = scope === 'commit' && context.kind === 'commit' ? context.oid : null;

  const loadFiles = useCallback(() => {
    if (!session) return;
    const bridge = getBridge();
    if (!bridge.getRepoFiles) return;

    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    bridge.getRepoFiles(session.sessionId, reqId, commitOid)
      .then((res) => {
        if (reqId === requestIdRef.current) {
          setRawFiles(res.files);
        }
      })
      .catch((err) => {
        if (reqId === requestIdRef.current) {
          setError(String(err));
        }
      })
      .finally(() => {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [session, commitOid]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, refreshing]);

  const deferredFilter = useDeferredValue(filter);

  // Map raw files to FileEntry with status detection from snapshot
  const allEntries: FileEntry[] = useMemo(() => {
    const stagedMap = new Map((snapshot?.staged ?? []).map((f) => [f.pathDisplay, f]));
    const unstagedMap = new Map((snapshot?.unstaged ?? []).map((f) => [f.pathDisplay, f]));

    return rawFiles.map((rf) => {
      const existing = unstagedMap.get(rf.path) ?? stagedMap.get(rf.path);
      const lastSlash = rf.path.lastIndexOf('/');
      const name = lastSlash === -1 ? rf.path : rf.path.slice(lastSlash + 1);
      const directory = lastSlash === -1 ? '' : rf.path.slice(0, lastSlash);

      return {
        id: `repo:${commitOid ? `${commitOid}:` : ''}${rf.path}`,
        name,
        directory,
        pathDisplay: rf.path,
        oldPathDisplay: null,
        status: existing?.status ?? (rf.isTracked ? 'modified' : 'untracked'),
        area: 'repo' as const,
        insertions: existing?.insertions,
        deletions: existing?.deletions,
        isBinary: existing?.isBinary ?? false,
      };
    });
  }, [rawFiles, snapshot?.staged, snapshot?.unstaged, commitOid]);

  const filteredEntries = useMemo(() => {
    const q = deferredFilter.trim().toLowerCase();
    if (!q) return allEntries;
    return allEntries.filter((f) => f.pathDisplay.toLowerCase().includes(q));
  }, [allEntries, deferredFilter]);

  const isTree = fileViewMode === 'tree';

  // Build tree & flat representation
  const treeNodes = useMemo(() => {
    return isTree ? buildTree(filteredEntries) : [];
  }, [isTree, filteredEntries]);

  const visibleTreeItems = useMemo(() => {
    return isTree ? flattenTree(treeNodes, collapsedDirs) : [];
  }, [isTree, treeNodes, collapsedDirs]);

  const totalItemCount = isTree ? visibleTreeItems.length : filteredEntries.length;
  const rowHeight = isTree ? TREE_ROW_HEIGHT : FLAT_ROW_HEIGHT;

  const visibleFiles = useMemo(() => {
    if (!isTree) return filteredEntries;
    const result: FileEntry[] = [];
    for (let i = 0; i < visibleTreeItems.length; i++) {
      const item = visibleTreeItems[i];
      if (!item.isDir && item.file) {
        result.push(item.file);
      }
    }
    return result;
  }, [isTree, visibleTreeItems, filteredEntries]);

  const virtualizer = useVirtualizer({
    count: totalItemCount,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [totalItemCount, isTree, virtualizer]);

  useEffect(() => {
    if (!selectedFile) return;
    const idx = isTree
      ? visibleTreeItems.findIndex((item) => !item.isDir && item.file?.pathDisplay === selectedFile.pathDisplay)
      : filteredEntries.findIndex((f) => f.pathDisplay === selectedFile.pathDisplay);
    if (idx !== -1) {
      virtualizer.scrollToIndex?.(idx, { align: 'auto' });
    }
  }, [selectedFile?.pathDisplay, isTree, visibleTreeItems, filteredEntries, virtualizer]);

  // Prefetch next and previous files in list for instantaneous preview on arrow navigation
  useEffect(() => {
    if (!selectedFile || preview?.fileId !== selectedFile.id) return;
    const index = visibleFiles.findIndex((f) => f.pathDisplay === selectedFile.pathDisplay);
    if (index < 0) return;
    if (visibleFiles[index + 1]) prefetchFile(visibleFiles[index + 1]);
    if (visibleFiles[index - 1]) prefetchFile(visibleFiles[index - 1]);
  }, [selectedFile?.pathDisplay, preview?.fileId, visibleFiles, prefetchFile]);

  const toggleDir = useCallback((dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedDirs(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    const allDirs = new Set<string>();
    function collect(items: typeof treeNodes) {
      for (const item of items) {
        if (item.isDir) {
          allDirs.add(item.fullPath);
          if (item.children) collect(item.children);
        }
      }
    }
    collect(treeNodes);
    setCollapsedDirs(allDirs);
  }, [treeNodes]);

  const handleFileClick = useCallback((file: FileEntry) => {
    void selectFile(file);
  }, [selectFile]);

  const handleFileDoubleClick = useCallback((file: FileEntry) => {
    void runOperation('openEditor', [], file.pathDisplay);
  }, [runOperation]);

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
        void selectFile(file).finally(() => {
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
      if (file) void selectFile(file);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTab = useAppStore.getState().filesTab;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (activePane === 'files' && currentTab === 'explorer') {
          e.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
          return;
        }
      }

      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (activePane !== 'files' || currentTab !== 'explorer') return;
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
      if (fileContextMenuRef.current || dirContextMenuRef.current) return;

      if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        setActivePane('history');
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (e.repeat && !pressedArrows.has(e.key)) return;
        pressedArrows.add(e.key);
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (visibleFiles.length === 0) return;
        const currentFile = useAppStore.getState().selectedFile;
        const curIdx = visibleFiles.findIndex((f) => f.id === currentFile?.id || f.pathDisplay === currentFile?.pathDisplay);
        const nextIdx = curIdx === -1 ? 0 : Math.min(visibleFiles.length - 1, curIdx + 1);
        if (visibleFiles[nextIdx] && (curIdx === -1 || nextIdx !== curIdx)) {
          if (e.repeat) {
            previewDeferred = true;
            schedulePreview();
            void selectFile(visibleFiles[nextIdx], { deferPreview: true });
          } else {
            previewDeferred = false;
            if (previewTimer !== null) clearTimeout(previewTimer);
            previewTimer = null;
            void selectFile(visibleFiles[nextIdx]);
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (visibleFiles.length === 0) return;
        const currentFile = useAppStore.getState().selectedFile;
        const curIdx = visibleFiles.findIndex((f) => f.id === currentFile?.id || f.pathDisplay === currentFile?.pathDisplay);
        const prevIdx = curIdx === -1 ? 0 : Math.max(0, curIdx - 1);
        if (visibleFiles[prevIdx] && (curIdx === -1 || prevIdx !== curIdx)) {
          if (e.repeat) {
            previewDeferred = true;
            schedulePreview();
            void selectFile(visibleFiles[prevIdx], { deferPreview: true });
          } else {
            previewDeferred = false;
            if (previewTimer !== null) clearTimeout(previewTimer);
            previewTimer = null;
            void selectFile(visibleFiles[prevIdx]);
          }
        }
      } else if (e.key === 'Enter') {
        const file = useAppStore.getState().selectedFile;
        if (file) {
          e.preventDefault();
          void runOperation('openEditor', [], file.pathDisplay);
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
  }, [
    activePane,
    filesTab,
    visibleFiles,
    selectFile,
    runOperation,
    setActivePane,
  ]);

  const handleFileContextMenu = useCallback((e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setFileContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
    });
  }, []);

  const handleDirContextMenu = useCallback((e: React.MouseEvent, nodeName: string, nodePath: string, files: FileEntry[]) => {
    e.preventDefault();
    e.stopPropagation();
    setDirContextMenu({
      x: e.clientX,
      y: e.clientY,
      dirName: nodeName,
      dirPath: nodePath,
      files,
      area: 'repo',
    });
  }, []);

  const hasCommitContext = context.kind === 'commit';

  return (
    <div className="file-explorer" aria-label={t('files.explorer')}>
      {/* Search Bar */}
      <div className="file-explorer-search">
        <div className="file-explorer-search-input-wrap">
          <Search size={13} className="file-explorer-search-icon" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="text"
            className="file-explorer-search-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (filter) {
                  setFilter('');
                } else {
                  e.currentTarget.blur();
                }
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.currentTarget.blur();
                if (visibleFiles.length > 0 && !selectedFile) {
                  void selectFile(visibleFiles[0]);
                }
              }
            }}
            placeholder={t('files.searchPlaceholder')}
            aria-label={t('files.searchPlaceholder')}
          />
          {filter && (
            <button
              type="button"
              className="file-explorer-clear-btn"
              onClick={() => setFilter('')}
              aria-label="Limpar filtro"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Explorer Toolbar */}
      <div className="file-explorer-toolbar">
        <span className="file-explorer-count">
          {filter
            ? t('files.filteredFilesCount', { filtered: filteredEntries.length, total: allEntries.length })
            : t('files.repoFilesCount', { count: allEntries.length })}
        </span>

        <div className="file-explorer-actions">
          {hasCommitContext && (
            <div className="file-explorer-scope-selector" role="group" aria-label="Escopo dos arquivos">
              <button
                type="button"
                className={`file-explorer-scope-btn ${scope === 'worktree' ? 'active' : ''}`}
                onClick={() => setScope('worktree')}
                title={t('files.scopeWorktree')}
              >
                {t('files.scopeWorktree')}
              </button>
              <button
                type="button"
                className={`file-explorer-scope-btn ${scope === 'commit' ? 'active' : ''}`}
                onClick={() => setScope('commit')}
                title={`${t('files.scopeCommit')} (${context.oid.slice(0, 7)})`}
              >
                <code>{context.oid.slice(0, 7)}</code>
              </button>
            </div>
          )}

          {isTree && (
            <>
              <button
                type="button"
                className="file-explorer-btn"
                onClick={expandAll}
                title={t('files.expandAll')}
                aria-label={t('files.expandAll')}
              >
                <ChevronsUpDown size={12} />
              </button>
              <button
                type="button"
                className="file-explorer-btn"
                onClick={collapseAll}
                title={t('files.collapseAll')}
                aria-label={t('files.collapseAll')}
              >
                <ChevronsDownUp size={12} />
              </button>
            </>
          )}

          <div className="view-mode-switch" role="group" aria-label="Modo de visualização dos arquivos">
            <button
              type="button"
              className={!isTree ? 'active' : ''}
              onClick={() => setFileViewMode('flat')}
              title={t('files.flatList')}
              aria-label={t('files.flatList')}
            >
              <List size={13} />
            </button>
            <button
              type="button"
              className={isTree ? 'active' : ''}
              onClick={() => setFileViewMode('tree')}
              title={t('files.treeList')}
              aria-label={t('files.treeList')}
            >
              <FolderTree size={13} />
            </button>
          </div>

          <button
            type="button"
            className="file-explorer-btn"
            onClick={loadFiles}
            disabled={loading}
            title="Recarregar arquivos"
            aria-label="Recarregar arquivos"
          >
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Explorer Content */}
      <div ref={viewportRef} className="file-explorer-scroll" tabIndex={0}>
        {loading && rawFiles.length === 0 && (
          <div className="file-history-loading" style={{ padding: '24px 12px' }}>
            <RefreshCw size={16} className="spin-icon" />
            <span>Carregando arquivos...</span>
          </div>
        )}

        {error && (
          <div className="file-history-error" style={{ margin: '12px' }}>
            {error}
          </div>
        )}

        {!loading && !error && filteredEntries.length === 0 && (
          <div className="file-history-empty" style={{ padding: '32px 12px' }}>
            {t('files.noFiles')}
          </div>
        )}

        {totalItemCount > 0 && (
          <div className="lists-virtual-content" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              if (isTree) {
                const node = visibleTreeItems[item.index];
                if (!node) return null;

                if (node.isDir) {
                  const isCollapsed = collapsedDirs.has(node.fullPath);
                  const descendantFiles = getDescendantFiles(node);
                  return (
                    <div
                      key={node.id}
                      className="lists-virtual-row lists-tree-row"
                      style={{ transform: `translateY(${item.start}px)`, height: `${TREE_ROW_HEIGHT}px` }}
                      onContextMenu={(e) => handleDirContextMenu(e, node.name, node.fullPath, descendantFiles)}
                    >
                      <button
                        type="button"
                        className="lists-tree-dir-row"
                        style={{ paddingLeft: `${6 + node.depth * 11}px` }}
                        onClick={() => toggleDir(node.fullPath)}
                        title={node.fullPath}
                      >
                        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        {isCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                        <span className="lists-tree-dir-name">{node.name}</span>
                        <span className="lists-tree-dir-count">({descendantFiles.length})</span>
                      </button>
                    </div>
                  );
                }

                const file = node.file!;
                const isSelected = selectedFile?.pathDisplay === file.pathDisplay;
                const FileIcon = fileIconFor(file.pathDisplay);

                return (
                  <div
                    key={file.id}
                    className="lists-virtual-row lists-tree-row"
                    style={{ transform: `translateY(${item.start}px)`, height: `${TREE_ROW_HEIGHT}px` }}
                    onContextMenu={(e) => handleFileContextMenu(e, file)}
                  >
                    <div
                      className={`lists-file-row is-tree-file-row`}
                      style={{ paddingLeft: `${6 + node.depth * 11}px` }}
                    >
                      <button
                        type="button"
                        aria-current={isSelected ? 'true' : undefined}
                        className={`lists-file-select is-tree-select ${isSelected ? 'lists-row-selected' : ''}`}
                        onClick={() => handleFileClick(file)}
                        onDoubleClick={() => handleFileDoubleClick(file)}
                        title={file.pathDisplay}
                      >
                        <span className="lists-status" style={{ opacity: 0.7 }}>
                          <FileIcon size={12} />
                        </span>
                        <span className="lists-file-name is-tree-file-name">
                          {file.name}
                        </span>
                      </button>

                      <div className="file-explorer-item-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="file-explorer-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            openFileHistory(file.pathDisplay);
                          }}
                          title={t('files.viewHistory')}
                          aria-label={t('files.viewHistory')}
                        >
                          <History size={12} />
                        </button>
                        <button
                          type="button"
                          className="file-explorer-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            void runOperation('openEditor', [], file.pathDisplay);
                          }}
                          title={t('files.openInEditor')}
                          aria-label={t('files.openInEditor')}
                        >
                          <Code2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // Flat mode
              const file = filteredEntries[item.index];
              if (!file) return null;
              const isSelected = selectedFile?.pathDisplay === file.pathDisplay;
              const FileIcon = fileIconFor(file.pathDisplay);

              return (
                <div
                  key={file.id}
                  className="lists-virtual-row"
                  style={{ transform: `translateY(${item.start}px)`, height: `${FLAT_ROW_HEIGHT}px` }}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <div className="lists-file-row" style={{ paddingLeft: '8px' }}>
                    <button
                      type="button"
                      aria-current={isSelected ? 'true' : undefined}
                      className={`lists-file-select ${isSelected ? 'lists-row-selected' : ''}`}
                      onClick={() => handleFileClick(file)}
                      onDoubleClick={() => handleFileDoubleClick(file)}
                      title={file.pathDisplay}
                    >
                      <span className="lists-status" style={{ opacity: 0.7 }}>
                        <FileIcon size={13} />
                      </span>
                      <span className="lists-file-name">
                        {file.name}
                        {file.directory && <small>{file.directory}</small>}
                      </span>
                    </button>

                    <div className="file-explorer-item-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="file-explorer-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFileHistory(file.pathDisplay);
                        }}
                        title={t('files.viewHistory')}
                        aria-label={t('files.viewHistory')}
                      >
                        <History size={12} />
                      </button>
                      <button
                        type="button"
                        className="file-explorer-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void runOperation('openEditor', [], file.pathDisplay);
                        }}
                        title={t('files.openInEditor')}
                        aria-label={t('files.openInEditor')}
                      >
                        <Code2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File Context Menu */}
      {fileContextMenu && (
        <FileContextMenu
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          file={fileContextMenu.file}
          repoPath={session?.root}
          commitOid={commitOid}
          onClose={() => setFileContextMenu(null)}
          onOpenEditor={(p) => void runOperation('openEditor', [], p)}
          onRevealFile={(p) => void runOperation('revealFile', [], p)}
          onViewHistory={(p) => openFileHistory(p)}
          onViewBlame={(_p) => setBlameOpen(true)}
          onRestoreCommitFile={commitOid ? (oid, path) => void restoreCommitFile?.(oid, path) : undefined}
          onOpenBrowser={(p, oid) => void openInBrowser?.({ commitOid: oid, filePath: p })}
        />
      )}

      {/* Directory Context Menu */}
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
          onOpenEditor={(p) => void runOperation('openEditor', [], p)}
          onRevealFile={(p) => void runOperation('revealFile', [], p)}
        />
      )}
    </div>
  );
});
