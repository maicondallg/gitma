import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Columns2,
  FoldVertical,
  History,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Rows3,
  Undo2,
} from 'lucide-react';
import { useAppStore } from '../store/app';
import { languageForPath, monaco } from '../lib/monaco';
import { useI18n } from '../i18n';
import { applyTheme, getThemeById, getActiveThemeId } from '../lib/theme';
import { getBridge } from '../lib/bridge';
import type { BlameLine, DiffHunk } from '../lib/types';
import { formatFullDate } from './FilesPanel';

function formatDateShort(timestamp: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function parseHunkDisplayInfo(hunk?: DiffHunk) {
  if (!hunk) return { rangeText: '', scopeText: '', isSingle: false };

  const rawHeader = hunk.header || '';
  const start = hunk.newLines > 0 ? hunk.newStart : hunk.oldStart;
  const count = hunk.newLines > 0 ? hunk.newLines : hunk.oldLines;
  const end = start + Math.max(1, count) - 1;
  const isSingle = count <= 1;
  const rangeText = isSingle ? `${start}` : `${start}–${end}`;

  let scopeText = '';
  const secondAt = rawHeader.indexOf('@@', 2);
  if (secondAt !== -1) {
    scopeText = rawHeader.substring(secondAt + 2).trim();
  }

  return { rangeText, scopeText, isSingle };
}

export function DiffPanel() {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const models = useRef<{ original: monaco.editor.ITextModel; modified: monaco.editor.ITextModel } | null>(null);
  const session = useAppStore((s) => s.session);
  const preview = useAppStore((s) => s.preview);
  const selectedFile = useAppStore((s) => s.selectedFile);
  const context = useAppStore((s) => s.context);
  const runOperation = useAppStore((s) => s.runOperation);
  const resolveConflict = useAppStore((s) => s.resolveConflict);
  const selectCommit = useAppStore((s) => s.selectCommit);
  const diffMode = useAppStore((s) => s.diffMode);
  const setDiffMode = useAppStore((s) => s.setDiffMode);
  const compactDiff = useAppStore((s) => s.compactDiff);
  const setCompactDiff = useAppStore((s) => s.setCompactDiff);
  const expandedDiff = useAppStore((s) => s.expandedDiff);
  const setExpandedDiff = useAppStore((s) => s.setExpandedDiff);
  const blameOpen = useAppStore((s) => s.blameOpen);
  const setBlameOpen = useAppStore((s) => s.setBlameOpen);

  interface VisibleBlameItem {
    kind: 'line';
    line: BlameLine;
    top: number;
    height: number;
  }
  interface VisibleBlameFold {
    kind: 'fold';
    id: string;
    count: number;
    top: number;
    height: number;
  }
  type VisibleBlameEntry = VisibleBlameItem | VisibleBlameFold;

  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  const [visibleBlameItems, setVisibleBlameItems] = useState<VisibleBlameEntry[]>([]);
  const [blameLoading, setBlameLoading] = useState(false);
  const blameScrollRef = useRef<HTMLDivElement>(null);

  // Allow exiting expanded/fullscreen diff mode using the Escape key
  useEffect(() => {
    if (!expandedDiff) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setExpandedDiff(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [expandedDiff, setExpandedDiff]);

  const [currentHunkIndex, setCurrentHunkIndex] = useState(0);
  const previewRef = useRef(preview);
  previewRef.current = preview;

  const jumpToHunk = useCallback((index: number) => {
    const hunks = previewRef.current?.hunks;
    if (!hunks || !hunks[index]) return;
    setCurrentHunkIndex(index);
    const hunk = hunks[index];
    const line = hunk.newStart || hunk.oldStart || 1;
    const modEditor = editor.current?.getModifiedEditor();
    if (modEditor) {
      modEditor.revealLineInCenter(line);
      modEditor.setPosition({ lineNumber: line, column: 1 });
      modEditor.focus();
    }
  }, []);

  const handlePrevHunk = useCallback(() => {
    if (currentHunkIndex > 0) {
      jumpToHunk(currentHunkIndex - 1);
    }
  }, [currentHunkIndex, jumpToHunk]);

  const handleNextHunk = useCallback(() => {
    const hunks = previewRef.current?.hunks;
    if (hunks && currentHunkIndex < hunks.length - 1) {
      jumpToHunk(currentHunkIndex + 1);
    }
  }, [currentHunkIndex, jumpToHunk]);

  const handleStageCurrentHunk = useCallback(async () => {
    const hunks = previewRef.current?.hunks;
    if (!hunks || !hunks[currentHunkIndex]) return;
    await runOperation('stageHunk', [], hunks[currentHunkIndex].patch);
  }, [currentHunkIndex, runOperation]);

  const handleUnstageCurrentHunk = useCallback(async () => {
    const hunks = previewRef.current?.hunks;
    if (!hunks || !hunks[currentHunkIndex]) return;
    await runOperation('unstageHunk', [], hunks[currentHunkIndex].patch);
  }, [currentHunkIndex, runOperation]);

  const handleDiscardCurrentHunk = useCallback(async () => {
    const hunks = previewRef.current?.hunks;
    if (!hunks || !hunks[currentHunkIndex]) return;
    await runOperation('discardHunk', [], hunks[currentHunkIndex].patch);
  }, [currentHunkIndex, runOperation]);

  useEffect(() => {
    setCurrentHunkIndex(0);
  }, [preview?.fileId, preview?.version]);

  useEffect(() => {
    if (!host.current) return;
    const diffEditor = monaco.editor.createDiffEditor(host.current, {
      automaticLayout: true,
      renderSideBySide: diffMode === 'split',
      useInlineViewWhenSpaceIsLimited: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      readOnly: true,
      originalEditable: false,
      renderOverviewRuler: false,
      renderIndicators: true,
      diffAlgorithm: 'advanced',
      ignoreTrimWhitespace: false,
      renderMarginRevertIcon: false,
      lineNumbers: 'on',
      lineDecorationsWidth: 18,
      lineHeight: 20,
      fontSize: 13,
      wordWrap: 'off',
      padding: { top: 8 },
      hideUnchangedRegions: {
        enabled: compactDiff,
        minimumLineCount: 3,
        contextLineCount: 3,
      },
      scrollbar: {
        vertical: 'visible',
        horizontal: 'auto',
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        verticalSliderSize: 10,
        horizontalSliderSize: 10,
        useShadows: false,
      },
    });
    editor.current = diffEditor;

    const modEditor = diffEditor.getModifiedEditor?.();
    const cursorSub = modEditor?.onDidChangeCursorPosition?.((e) => {
      const hunks = previewRef.current?.hunks;
      if (!hunks || hunks.length === 0) return;
      const line = e.position.lineNumber;
      const idx = hunks.findIndex(
        (h) => line >= h.newStart && line <= h.newStart + Math.max(1, h.newLines) - 1
      );
      if (idx !== -1) {
        setCurrentHunkIndex(idx);
      }
    });

    try {
      applyTheme(getThemeById(getActiveThemeId()));
    } catch {}
    return () => {
      cursorSub?.dispose?.();
      diffEditor.dispose();
      editor.current = null;
      models.current?.original.dispose();
      models.current?.modified.dispose();
      models.current = null;
    };
  }, []);

  useEffect(() => {
    editor.current?.updateOptions({ renderSideBySide: diffMode === 'split' });
  }, [diffMode]);

  useEffect(() => {
    editor.current?.updateOptions({
      hideUnchangedRegions: {
        enabled: compactDiff,
        minimumLineCount: 3,
        contextLineCount: 3,
      },
    });
  }, [compactDiff]);

  useEffect(() => {
    const hunk = preview?.hunks?.[currentHunkIndex];
    const diffEditor = editor.current;
    const panel = host.current;
    const modified = diffEditor?.getModifiedEditor();
    if (!hunk || !panel || !diffEditor || !modified) return;

    const highlight = document.createElement('div');
    highlight.className = 'diff-hunk-highlight';
    highlight.setAttribute('aria-hidden', 'true');
    panel.appendChild(highlight);

    const update = () => {
      const editorNode = modified.getDomNode?.();
      if (!editorNode || !modified.getModel?.()) {
        highlight.style.display = 'none';
        return;
      }
      const panelRect = panel.getBoundingClientRect();
      const editorRect = editorNode.getBoundingClientRect();
      const startLine = Math.max(1, hunk.newStart);
      const endLine = Math.max(startLine, hunk.newStart + Math.max(1, hunk.newLines) - 1);
      const editorTop = editorRect.top - panelRect.top - modified.getScrollTop();
      const top = editorTop + modified.getTopForLineNumber(startLine);
      const bottom = editorTop + modified.getBottomForLineNumber(endLine);
      const visibleTop = Math.max(0, top);
      const visibleBottom = Math.min(panelRect.height, bottom);
      const isVisible = visibleBottom > visibleTop;
      highlight.style.display = isVisible ? '' : 'none';
      highlight.style.left = `${diffMode === 'split' ? editorRect.left - panelRect.left : 0}px`;
      highlight.style.top = `${visibleTop}px`;
      highlight.style.height = `${Math.max(0, visibleBottom - visibleTop)}px`;
      highlight.classList.toggle('has-start', top >= 0);
      highlight.classList.toggle('has-end', bottom <= panelRect.height);
    };

    const subscriptions = [
      modified.onDidScrollChange(update),
      modified.onDidLayoutChange(update),
      modified.onDidChangeHiddenAreas(update),
      modified.onDidChangeModel(update),
      diffEditor.onDidUpdateDiff(update),
    ];
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    resizeObserver?.observe(panel);
    update();
    const frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      subscriptions.forEach((subscription) => subscription.dispose());
      resizeObserver?.disconnect();
      highlight.remove();
    };
  }, [preview?.hunks, preview?.version, currentHunkIndex, diffMode]);

  useEffect(() => {
    if (!blameOpen || !selectedFile || !session) {
      setBlameLines([]);
      setBlameLoading(false);
      return;
    }

    let active = true;
    setBlameLoading(true);

    const commitOid = context?.kind === 'commit' ? context.oid : undefined;
    const reqId = Date.now();
    getBridge()
      .getBlame(session.sessionId, reqId, selectedFile.pathDisplay, commitOid)
      .then((res) => {
        if (!active) return;
        setBlameLines(res.lines);
        setBlameLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setBlameLines([]);
        setBlameLoading(false);
      });

    return () => {
      active = false;
    };
  }, [blameOpen, selectedFile?.pathDisplay, context?.kind === 'commit' ? context.oid : null, session]);

  const updateVisibleBlame = useCallback(() => {
    const diffEditor = editor.current;
    if (!diffEditor || !blameOpen || blameLines.length === 0) {
      setVisibleBlameItems([]);
      return;
    }
    const modEditor = diffEditor.getModifiedEditor?.();
    if (!modEditor) return;

    if (!modEditor.getVisibleRanges) {
      setVisibleBlameItems(
        blameLines.map((line, idx) => ({
          kind: 'line',
          line,
          top: idx * 20,
          height: 20,
        }))
      );
      return;
    }

    const visibleRanges = modEditor.getVisibleRanges();
    if (!visibleRanges || visibleRanges.length === 0) {
      setVisibleBlameItems([]);
      return;
    }

    const scrollTop = modEditor.getScrollTop?.() ?? 0;
    const lineHeight =
      (monaco.editor?.EditorOption?.lineHeight !== undefined && modEditor.getOption
        ? modEditor.getOption(monaco.editor.EditorOption.lineHeight)
        : 20) || 20;
    const items: VisibleBlameEntry[] = [];

    const sortedRanges = [...visibleRanges].sort((a, b) => a.startLineNumber - b.startLineNumber);

    let prevEndLine = 0;
    for (const range of sortedRanges) {
      // Check for hidden lines preceding this range
      if (prevEndLine > 0 && range.startLineNumber > prevEndLine + 1) {
        const hiddenCount = range.startLineNumber - prevEndLine - 1;
        const foldTop = modEditor.getTopForLineNumber(prevEndLine, false) + lineHeight - scrollTop;
        const foldBottom = modEditor.getTopForLineNumber(range.startLineNumber, false) - scrollTop;
        const foldHeight = foldBottom - foldTop;
        if (foldHeight > 0) {
          items.push({
            kind: 'fold',
            id: `fold-${prevEndLine}-${range.startLineNumber}`,
            count: hiddenCount,
            top: foldTop,
            height: foldHeight,
          });
        }
      } else if (prevEndLine === 0 && range.startLineNumber > 1) {
        // Hidden lines at the top of the file
        const hiddenCount = range.startLineNumber - 1;
        const foldBottom = modEditor.getTopForLineNumber(range.startLineNumber, false) - scrollTop;
        if (foldBottom > 0) {
          items.push({
            kind: 'fold',
            id: `fold-start-${range.startLineNumber}`,
            count: hiddenCount,
            top: 0,
            height: foldBottom,
          });
        }
      }

      for (let lineNum = range.startLineNumber; lineNum <= range.endLineNumber; lineNum++) {
        const lineData = blameLines[lineNum - 1];
        if (!lineData) continue;
        const topContent = modEditor.getTopForLineNumber(lineNum, false);
        const screenY = topContent - scrollTop;

        items.push({
          kind: 'line',
          line: lineData,
          top: screenY,
          height: lineHeight,
        });
      }

      prevEndLine = range.endLineNumber;
    }

    setVisibleBlameItems(items);
  }, [blameOpen, blameLines]);

  useEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor || !blameOpen) return;
    const modEditor = diffEditor.getModifiedEditor?.();
    if (!modEditor) return;

    updateVisibleBlame();
    const t1 = setTimeout(updateVisibleBlame, 50);
    const t2 = setTimeout(updateVisibleBlame, 150);

    const subs = [
      modEditor.onDidScrollChange?.(() => updateVisibleBlame()),
      modEditor.onDidLayoutChange?.(() => updateVisibleBlame()),
      (modEditor as unknown as { onDidChangeHiddenAreas?: (cb: () => void) => { dispose: () => void } }).onDidChangeHiddenAreas?.(() => updateVisibleBlame()),
      (diffEditor as unknown as { onDidUpdateDiff?: (cb: () => void) => { dispose: () => void } }).onDidUpdateDiff?.(() => updateVisibleBlame()),
      (diffEditor as unknown as { onDidChangeModel?: (cb: () => void) => { dispose: () => void } }).onDidChangeModel?.(() => updateVisibleBlame()),
    ].filter(Boolean);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      subs.forEach((s) => s?.dispose?.());
    };
  }, [blameOpen, updateVisibleBlame, preview?.fileId, preview?.version]);

  useEffect(() => {
    const target = editor.current;
    if (!target || !preview || (preview.kind !== 'text' && preview.kind !== 'conflict')) {
      target?.setModel(null);
      return;
    }
    const language = languageForPath(selectedFile?.pathDisplay ?? selectedFile?.name ?? '');
    const old = models.current;
    const original = monaco.editor.createModel(preview.original, language);
    const modified = monaco.editor.createModel(preview.modified, language);
    models.current = { original, modified };
    target.setModel({ original, modified });
    old?.original.dispose();
    old?.modified.dispose();
  }, [preview?.version, preview?.kind, selectedFile?.id]);

  const label = selectedFile
    ? selectedFile.oldPathDisplay
      ? `${selectedFile.oldPathDisplay} → ${selectedFile.pathDisplay}`
      : selectedFile.pathDisplay
    : t('diff.selectFile');
  const isConflict = preview?.kind === 'conflict';
  const unavailable = preview && preview.kind !== 'text' && !isConflict;

  return (
    <section className="diff-panel" aria-label="Diff">
      <header className="panel-header diff-header">
        <span className="path-label" title={label}>
          <bdo dir="ltr">{label}</bdo>
        </span>
        <div className="mode-switch" role="group" aria-label="Layout do diff">
          <button
            type="button"
            className={blameOpen ? 'active' : ''}
            onClick={() => setBlameOpen(!blameOpen)}
            title={blameOpen ? t('diff.blameActive') : t('diff.toggleBlame')}
            aria-pressed={blameOpen}
          >
            <History size={14} />
            <span>{t('diff.toggleBlame')}</span>
          </button>
          <button
            type="button"
            className={compactDiff ? 'active' : ''}
            onClick={() => setCompactDiff(!compactDiff)}
            title={compactDiff ? t('diff.compactDiffActive') : t('diff.compactDiffInactive')}
            aria-pressed={compactDiff}
          >
            <FoldVertical size={14} />
            <span>{t('diff.onlyChanges')}</span>
          </button>
          <button
            type="button"
            className={diffMode === 'unified' ? 'active' : ''}
            onClick={() => setDiffMode('unified')}
            title={t('diff.unified')}
            aria-pressed={diffMode === 'unified'}
          >
            <Rows3 size={14} />
            <span>{t('diff.unified')}</span>
          </button>
          <button
            type="button"
            className={diffMode === 'split' ? 'active' : ''}
            onClick={() => setDiffMode('split')}
            title={t('diff.split')}
            aria-pressed={diffMode === 'split'}
          >
            <Columns2 size={14} />
            <span>{t('diff.split')}</span>
          </button>
          <div className="diff-toolbar-separator" />
          <button
            type="button"
            className={`diff-expand-btn ${expandedDiff ? 'active' : ''}`}
            onClick={() => setExpandedDiff(!expandedDiff)}
            title={expandedDiff ? t('diff.restoreDiff') : t('diff.expandDiff')}
            aria-label={expandedDiff ? t('diff.restoreDiff') : t('diff.expandDiff')}
            aria-pressed={expandedDiff}
          >
            {expandedDiff ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </header>
      {context?.kind === 'local' && selectedFile?.area && preview?.hunks && preview.hunks.length > 0 && (
        <div className="diff-hunk-bar" role="toolbar" aria-label="Navegação de blocos">
          <div className="diff-hunk-info">
            <span className="hunk-badge">
              {t('diff.hunkBadge', {
                current: Math.min(currentHunkIndex + 1, preview.hunks.length),
                total: preview.hunks.length,
                defaultValue: t('diff.hunkCount', {
                  current: Math.min(currentHunkIndex + 1, preview.hunks.length),
                  total: preview.hunks.length,
                }),
              })}
            </span>
            {(() => {
              const currentHunk = preview.hunks[currentHunkIndex];
              const info = parseHunkDisplayInfo(currentHunk);
              const tooltip = info.scopeText
                ? `${t('diff.hunkLocationTooltip', { range: info.isSingle ? t('diff.hunkSingleLine', { line: info.rangeText }) : t('diff.hunkLines', { range: info.rangeText }) })} (${info.scopeText})`
                : t('diff.hunkLocationTooltip', { range: info.isSingle ? t('diff.hunkSingleLine', { line: info.rangeText }) : t('diff.hunkLines', { range: info.rangeText }) });
              return (
                <span className="hunk-lines" title={tooltip}>
                  <span className="hunk-range-pill">
                    {info.isSingle
                      ? t('diff.hunkSingleLine', { line: info.rangeText })
                      : t('diff.hunkLines', { range: info.rangeText })}
                  </span>
                  {info.scopeText && (
                    <span className="hunk-scope-pill" title={info.scopeText}>
                      <span className="hunk-scope-prefix">{t('diff.hunkScopePrefix')}:</span>
                      {info.scopeText}
                    </span>
                  )}
                </span>
              );
            })()}
          </div>
          <div className="diff-hunk-nav">
            <button
              type="button"
              className="hunk-nav-btn"
              disabled={currentHunkIndex <= 0}
              onClick={handlePrevHunk}
              title={t('diff.prevHunk')}
              aria-label={t('diff.prevHunk')}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className="hunk-nav-btn"
              disabled={currentHunkIndex >= preview.hunks.length - 1}
              onClick={handleNextHunk}
              title={t('diff.nextHunk')}
              aria-label={t('diff.nextHunk')}
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="diff-hunk-actions">
            {selectedFile.area === 'unstaged' ? (
              <>
                <button
                  type="button"
                  className="hunk-action-btn hunk-stage-btn"
                  onClick={handleStageCurrentHunk}
                  title={`${t('diff.stageHunk')} (Ctrl+Alt+S)`}
                >
                  <Plus size={13} />
                  <span>{t('diff.stageHunk')}</span>
                </button>
                <button
                  type="button"
                  className="hunk-action-btn hunk-discard-btn"
                  onClick={handleDiscardCurrentHunk}
                  title={t('diff.discardHunk')}
                >
                  <Undo2 size={13} />
                  <span>{t('diff.discardHunk')}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="hunk-action-btn hunk-unstage-btn"
                onClick={handleUnstageCurrentHunk}
                title={`${t('diff.unstageHunk')} (Ctrl+Alt+U)`}
              >
                <Minus size={13} />
                <span>{t('diff.unstageHunk')}</span>
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`diff-body ${blameOpen && !unavailable ? 'has-blame' : ''}`}>
        {blameOpen && !unavailable && (
          <div
            className="diff-blame-column"
            ref={blameScrollRef}
            onWheel={(e) => {
              const mod = editor.current?.getModifiedEditor();
              if (mod) {
                mod.setScrollTop(mod.getScrollTop() + e.deltaY);
              }
            }}
          >
            {blameLoading ? (
              <div className="diff-blame-loading">
                <Clock size={13} className="spin" />
                <span>Carregando blame...</span>
              </div>
            ) : (
              visibleBlameItems.map((entry) => {
                if (entry.kind === 'fold') {
                  return (
                    <div
                      key={entry.id}
                      className="diff-blame-fold-row"
                      style={{
                        position: 'absolute',
                        top: `${entry.top}px`,
                        height: `${entry.height}px`,
                        left: 0,
                        right: 0,
                      }}
                      title={`${entry.count} linhas ocultas`}
                    >
                      <span className="diff-blame-fold-text">
                        <FoldVertical size={11} />
                        <span>{entry.count} ocultas</span>
                      </span>
                    </div>
                  );
                }

                const line = entry.line;
                const isUncommitted = !line.commitOid || line.commitOid.startsWith('00000000');
                return (
                  <div
                    key={line.lineNumber}
                    className={`diff-blame-row ${isUncommitted ? 'is-uncommitted' : ''}`}
                    style={{
                      position: 'absolute',
                      top: `${entry.top}px`,
                      height: `${entry.height}px`,
                      left: 0,
                      right: 0,
                    }}
                    onClick={() => {
                      if (!isUncommitted) {
                        void selectCommit(line.commitOid);
                      }
                    }}
                    title={
                      isUncommitted
                        ? t('diff.notCommitted')
                        : `${line.commitOid}\n${line.author} <${line.authorMail}>\n${formatFullDate(line.authorTimestamp)}\n\n${line.summary}`
                    }
                  >
                    <span className="diff-blame-line-num">{line.lineNumber}</span>
                    {isUncommitted ? (
                      <span className="diff-blame-uncommitted">{t('diff.notCommitted')}</span>
                    ) : (
                      <>
                        <code className="diff-blame-hash">{line.commitOid.slice(0, 7)}</code>
                        <span className="diff-blame-author" title={line.author}>
                          {line.author}
                        </span>
                        <span className="diff-blame-date">{formatDateShort(line.authorTimestamp)}</span>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
        {!preview && <div className="empty-state">{t('diff.selectFilePrompt')}</div>}
        {unavailable && (
          <div className="empty-state">
            <strong>
              {preview.kind === 'tooLarge'
                ? t('diff.tooLarge')
                : preview.kind === 'binary'
                ? t('diff.binary')
                : preview.kind === 'conflict'
                ? t('diff.conflict')
                : t('diff.unavailable')}
            </strong>
            <span>{preview.message ?? t('diff.noTextPreview')}</span>
          </div>
        )}
        {isConflict && selectedFile && (
          <div className="diff-conflict-banner" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '8px 12px',
            background: 'rgba(234, 179, 8, 0.12)',
            borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
            color: 'var(--text)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 500 }}>
              <AlertTriangle size={15} style={{ color: '#eab308' }} />
              <span>{t('conflicts.banner')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void resolveConflict(selectedFile.pathDisplay, 'ours')}
                title={t('conflicts.acceptOurs')}
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                {t('conflicts.acceptOurs')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void resolveConflict(selectedFile.pathDisplay, 'theirs')}
                title={t('conflicts.acceptTheirs')}
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                {t('conflicts.acceptTheirs')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void resolveConflict(selectedFile.pathDisplay, 'both')}
                title={t('conflicts.acceptBoth')}
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                {t('conflicts.acceptBoth')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void resolveConflict(selectedFile.pathDisplay, 'mark_resolved')}
                title={t('conflicts.markResolved')}
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                {t('conflicts.markResolved')}
              </button>
            </div>
          </div>
        )}
        <div ref={host} className="monaco-host" hidden={!preview || (preview.kind !== 'text' && !isConflict)} />
      </div>
    </section>
  );
}
