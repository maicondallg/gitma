import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, Clock, Columns2, Copy, ExternalLink, FoldVertical, History, Rows3, Search, User, X } from 'lucide-react';
import { getBridge } from '../lib/bridge';
import { languageForPath, monaco } from '../lib/monaco';
import '../lib/editorTheme';
import { applyTheme, getActiveThemeId, getThemeById } from '../lib/theme';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';
import type { FileHistoryEntry, Preview } from '../lib/types';
import { formatFullDate } from './FilesPanel';

export interface FileHistoryModalProps {
  filePath: string | null;
  onClose: () => void;
}

interface DiffViewModelWithUnchangedRegions extends monaco.editor.IDiffEditorViewModel {
  unchangedRegions?: { get(): unknown[] };
}

interface MonacoEditorWithHiddenAreas extends monaco.editor.ICodeEditor {
  _getViewModel?(): { getHiddenAreas(): monaco.IRange[] } | null;
}

function hiddenAreaCount(codeEditor: monaco.editor.ICodeEditor): number {
  return (codeEditor as MonacoEditorWithHiddenAreas)._getViewModel?.()?.getHiddenAreas()?.length ?? 0;
}

function HistoryDiff({ preview, path, split, onlyChanges }: { preview: Preview; path: string; split: boolean; onlyChanges: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const models = useRef<{ original: monaco.editor.ITextModel; modified: monaco.editor.ITextModel } | null>(null);
  const modelSource = useRef<{ version: string; path: string } | null>(null);
  const [preparing, setPreparing] = useState(false);

  useLayoutEffect(() => {
    if (!host.current || preview.kind !== 'text') return;
    const diff = monaco.editor.createDiffEditor(host.current, {
      automaticLayout: true,
      contextmenu: false,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: split,
      useInlineViewWhenSpaceIsLimited: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      fontSize: 13,
      lineHeight: 20,
      renderOverviewRuler: false,
      hideUnchangedRegions: {
        enabled: onlyChanges,
        minimumLineCount: 3,
        contextLineCount: 3,
      },
    });
    editor.current = diff;
    try { applyTheme(getThemeById(getActiveThemeId())); } catch { /* theme remains usable */ }
    return () => {
      editor.current = null;
      diff.dispose();
      models.current?.original.dispose();
      models.current?.modified.dispose();
      models.current = null;
      modelSource.current = null;
    };
  }, [preview.kind]);

  useLayoutEffect(() => {
    editor.current?.updateOptions({ renderSideBySide: split });
  }, [split]);

  useLayoutEffect(() => {
    editor.current?.updateOptions({
      hideUnchangedRegions: {
        enabled: onlyChanges,
        minimumLineCount: 3,
        contextLineCount: 3,
      },
    });
  }, [onlyChanges]);

  useLayoutEffect(() => {
    const target = editor.current;
    if (!target || preview.kind !== 'text') return;
    let disposed = false;
    let viewModelAttached = false;
    const subscriptions: monaco.IDisposable[] = [];
    const shouldCompact = onlyChanges;
    if (host.current) host.current.style.visibility = shouldCompact ? 'hidden' : '';
    setPreparing(shouldCompact);
    target.setModel(null);
    if (!models.current || modelSource.current?.version !== preview.version || modelSource.current.path !== path) {
      const language = languageForPath(path);
      const old = models.current;
      models.current = {
        original: monaco.editor.createModel(preview.original, language),
        modified: monaco.editor.createModel(preview.modified, language),
      };
      modelSource.current = { version: preview.version, path };
      old?.original.dispose();
      old?.modified.dispose();
    }
    const { original, modified } = models.current;
    const viewModel = shouldCompact
      ? target.createViewModel({ original, modified }) as DiffViewModelWithUnchangedRegions
      : null;
    if (!shouldCompact) {
      target.setModel({ original, modified });
    } else {
      // Attach the model only after Monaco has calculated its diff. Keep the
      // host hidden until unchanged regions are folded in both editors.
      void viewModel!.waitForDiff().then(() => {
        if (disposed) return;
        const originalEditor = target.getOriginalEditor();
        const modifiedEditor = target.getModifiedEditor();
        const expectedHiddenAreas = viewModel!.unchangedRegions?.get().length ?? 0;

        const revealWhenFolded = () => {
          if (disposed) return;
          const changes = target.getLineChanges();
          if (changes === null) return;
          if (expectedHiddenAreas > 0 && (
            hiddenAreaCount(originalEditor) < expectedHiddenAreas ||
            hiddenAreaCount(modifiedEditor) < expectedHiddenAreas
          )) return;
          const firstChange = changes[0];
          if (firstChange) modifiedEditor.revealLineInCenter(firstChange.modifiedStartLineNumber);
          originalEditor.render(true);
          modifiedEditor.render(true);
          requestAnimationFrame(() => {
            if (disposed) return;
            if (host.current) host.current.style.visibility = '';
            setPreparing(false);
            subscriptions.splice(0).forEach((subscription) => subscription.dispose());
          });
        };

        subscriptions.push(
          originalEditor.onDidChangeHiddenAreas(revealWhenFolded),
          modifiedEditor.onDidChangeHiddenAreas(revealWhenFolded),
          target.onDidUpdateDiff(revealWhenFolded),
        );
        target.setModel(viewModel!);
        viewModelAttached = true;
        revealWhenFolded();
      }).catch(() => {
        if (disposed) return;
        if (host.current) host.current.style.visibility = '';
        setPreparing(false);
      });
    }
    return () => {
      disposed = true;
      subscriptions.splice(0).forEach((subscription) => subscription.dispose());
      if (viewModel && !viewModelAttached) viewModel.dispose();
    };
  }, [preview.version, preview.kind, path, onlyChanges]);

  if (preview.kind !== 'text') return <div className="file-history-preview-state">{preview.message}</div>;
  return <>
    <div className="file-history-diff" ref={host} aria-label="Diff do arquivo" />
    {preparing && <div className="file-history-diff-preparing" role="status"><Clock size={20} className="spin-icon" /></div>}
  </>;
}

export function FileHistoryModal({ filePath, onClose }: FileHistoryModalProps) {
  const { t } = useI18n();
  const session = useAppStore((s) => s.session);
  const selectCommit = useAppStore((s) => s.selectCommit);
  const [entries, setEntries] = useState<FileHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [split, setSplit] = useState(true);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const previewCache = useRef(new Map<string, Preview>());

  useEffect(() => {
    previewCache.current.clear();
    setEntries([]);
    setSelectedOid(null);
    setPreview(null);
    setFilter('');
    if (!filePath || !session) return;
    let active = true;
    setLoading(true);
    setError(null);
    getBridge().getFileHistory(session.sessionId, Date.now(), filePath, 150)
      .then((result) => {
        if (!active) return;
        setEntries(result.entries);
        setSelectedOid(result.entries[0]?.oid ?? null);
      })
      .catch((err) => { if (active) setError(String(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filePath, session?.sessionId]);

  const selectedEntry = entries.find((entry) => entry.oid === selectedOid);
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!selectedEntry || !session) return;
    const cacheKey = `${selectedEntry.oid}:${selectedEntry.path}`;
    const cached = previewCache.current.get(cacheKey);
    if (cached) {
      setPreview(cached);
      setPreviewLoading(false);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    getBridge().getFileHistoryPreview(session.sessionId, Date.now(), selectedEntry.oid, selectedEntry.path)
      .then((result) => {
        if (!active) return;
        previewCache.current.set(cacheKey, result);
        if (previewCache.current.size > 8) {
          const oldest = previewCache.current.keys().next().value;
          if (oldest) previewCache.current.delete(oldest);
        }
        setPreview(result);
      })
      .catch((err) => { if (active) setPreviewError(String(err)); })
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [session?.sessionId, selectedEntry?.oid, selectedEntry?.path]);

  useEffect(() => {
    if (!filePath) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filePath, onClose]);

  const filteredEntries = useMemo(() => {
    const query = filter.toLowerCase().trim();
    return query ? entries.filter((entry) =>
      [entry.oid, entry.summary, entry.author, entry.email].some((value) => value.toLowerCase().includes(query))) : entries;
  }, [entries, filter]);

  const handleCopy = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash((current) => current === hash ? null : current), 1500);
    } catch { /* clipboard access may be unavailable */ }
  };

  if (!filePath) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="file-history-title">
      <div className="modal-card file-history-modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <History size={18} className="modal-icon" />
            <div>
              <h3 id="file-history-title">{t('fileHistory.title')}</h3>
              <p className="modal-subtitle" title={filePath}>{filePath}</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('fileHistory.close')}><X size={16} /></button>
        </header>

        <div className="file-history-workspace">
          <aside className="file-history-sidebar" aria-label={t('fileHistory.revisions')}>
            <div className="file-history-search-bar">
              <Search size={14} className="file-history-search-icon" />
              <input type="text" className="file-history-search-input" value={filter}
                onChange={(event) => setFilter(event.target.value)} placeholder={t('fileHistory.filter')} />
              {filter && <button type="button" className="file-history-clear-btn" onClick={() => setFilter('')} aria-label={t('fileHistory.clearFilter')}><X size={12} /></button>}
            </div>
            <div className="file-history-body">
              {loading && <div className="file-history-loading"><Clock size={20} className="spin-icon" />{t('fileHistory.loading')}</div>}
              {error && <div className="file-history-error">{error}</div>}
              {!loading && !error && filteredEntries.length === 0 && <div className="file-history-empty">{t('fileHistory.noEntries')}</div>}
              {!loading && !error && <div className="file-history-timeline">
                {filteredEntries.map((entry) => (
                  <div key={entry.oid} className={`file-history-item ${selectedOid === entry.oid ? 'is-selected' : ''}`}
                    onClick={(event) => {
                      if (event.target instanceof Element && !event.target.closest('button')) {
                        setSelectedOid(entry.oid);
                      }
                    }}>
                    <button type="button" className="file-history-select" onClick={() => setSelectedOid(entry.oid)}
                      aria-pressed={selectedOid === entry.oid} title={t('fileHistory.selectCommit')}>
                      <span className="file-history-summary" title={entry.summary}>{entry.summary}</span>
                      <span className="file-history-item-meta">
                        <span className="file-history-author" title={`${entry.author} <${entry.email}>`}><User size={11} />{entry.author}</span>
                        <time className="file-history-date" dateTime={new Date(entry.timestamp * 1000).toISOString()}><Calendar size={11} />{formatFullDate(entry.timestamp)}</time>
                      </span>
                    </button>
                    <div className="file-history-item-actions">
                      <button type="button" className={`file-history-hash ${copiedHash === entry.oid ? 'is-copied' : ''}`}
                        onClick={() => void handleCopy(entry.oid)} title={t('fileHistory.copyHash')}>
                        {copiedHash === entry.oid ? <Check size={11} /> : <Copy size={11} />}<code>{entry.oid.slice(0, 7)}</code>
                      </button>
                      <button type="button" className="file-history-jump-btn" title={t('fileHistory.openInGraph')}
                        onClick={() => { void selectCommit(entry.oid); onClose(); }}><ExternalLink size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>}
            </div>
            <footer className="file-history-sidebar-footer">{t('fileHistory.count', { count: filteredEntries.length })}</footer>
          </aside>

          <section className="file-history-preview" aria-label={t('fileHistory.changes')}>
            <div className="file-history-preview-header">
              <div className="file-history-preview-heading">
                <strong>{selectedEntry ? selectedEntry.path : t('fileHistory.changes')}</strong>
                {selectedEntry && <span>{selectedEntry.oid.slice(0, 7)} · {selectedEntry.summary}</span>}
              </div>
              <div className="mode-switch file-history-mode-switch" role="group" aria-label={t('fileHistory.diffLayout')}>
                <button type="button" className={onlyChanges ? 'active' : ''}
                  onClick={() => setOnlyChanges((current) => !current)}
                  title={onlyChanges ? t('diff.compactDiffActive') : t('diff.compactDiffInactive')}
                  aria-pressed={onlyChanges}>
                  <FoldVertical size={14} /><span>{t('diff.onlyChanges')}</span>
                </button>
                <button type="button" className={!split ? 'active' : ''} onClick={() => setSplit(false)} title={t('diff.unified')} aria-pressed={!split}><Rows3 size={14} /><span>{t('diff.unified')}</span></button>
                <button type="button" className={split ? 'active' : ''} onClick={() => setSplit(true)} title={t('diff.split')} aria-pressed={split}><Columns2 size={14} /><span>{t('diff.split')}</span></button>
              </div>
            </div>
            <div className="file-history-preview-content">
              {previewLoading && <div className="file-history-preview-state file-history-pending"><Clock size={20} className="spin-icon" />{t('fileHistory.loadingDiff')}</div>}
              {previewError && <div className="file-history-preview-state file-history-error">{previewError}</div>}
              {!selectedEntry && !loading && <div className="file-history-preview-state">{t('fileHistory.noSelection')}</div>}
              {preview && !previewLoading && <HistoryDiff preview={preview} path={selectedEntry?.path ?? filePath} split={split} onlyChanges={onlyChanges} />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
