import { useEffect, useRef } from 'react';
import { Columns2, FoldVertical, Maximize2, Minimize2, Rows3 } from 'lucide-react';
import { useAppStore } from '../store/app';
import { languageForPath, monaco } from '../lib/monaco';
import { useI18n } from '../i18n';
import { applyTheme, getThemeById, getActiveThemeId } from '../lib/theme';

export function DiffPanel() {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const models = useRef<{ original: monaco.editor.ITextModel; modified: monaco.editor.ITextModel } | null>(null);
  const preview = useAppStore((s) => s.preview);
  const selectedFile = useAppStore((s) => s.selectedFile);
  const diffMode = useAppStore((s) => s.diffMode);
  const setDiffMode = useAppStore((s) => s.setDiffMode);
  const compactDiff = useAppStore((s) => s.compactDiff);
  const setCompactDiff = useAppStore((s) => s.setCompactDiff);
  const expandedDiff = useAppStore((s) => s.expandedDiff);
  const setExpandedDiff = useAppStore((s) => s.setExpandedDiff);

  useEffect(() => {
    if (!host.current) return;
    editor.current = monaco.editor.createDiffEditor(host.current, {
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
    try {
      applyTheme(getThemeById(getActiveThemeId()));
    } catch {}
    return () => {
      editor.current?.dispose();
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
    const target = editor.current;
    if (!target || !preview || preview.kind !== 'text') {
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
  const unavailable = preview && preview.kind !== 'text';

  return (
    <section className="diff-panel" aria-label="Diff">
      <header className="panel-header diff-header">
        <span className="path-label" title={label}>
          <bdo dir="ltr">{label}</bdo>
        </span>
        <div className="mode-switch" role="group" aria-label="Layout do diff">
          <button
            type="button"
            className={compactDiff ? 'active' : ''}
            onClick={() => setCompactDiff(!compactDiff)}
            title={compactDiff ? t('diff.compactDiffActive') : t('diff.compactDiffInactive')}
            aria-pressed={compactDiff}
          >
            <FoldVertical size={14} />
            <span>{t('diff.compactDiff')}</span>
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
      <div className="diff-body">
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
        <div ref={host} className="monaco-host" hidden={!preview || preview.kind !== 'text'} />
      </div>
    </section>
  );
}

