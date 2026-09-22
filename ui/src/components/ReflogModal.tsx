import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  GitBranchPlus,
  History,
  RotateCcw,
  Search,
  User,
  X,
} from 'lucide-react';
import { getBridge } from '../lib/bridge';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';
import type { ReflogEntry } from '../lib/types';
import { formatFullDate } from './FilesPanel';
import { NewBranchModal } from './NewBranchModal';
import { ResetModal } from './ResetModal';

export interface ReflogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReflogModal({ isOpen, onClose }: ReflogModalProps) {
  const { t } = useI18n();
  const session = useAppStore((s) => s.session);
  const snapshot = useAppStore((s) => s.snapshot);
  const selectCommit = useAppStore((s) => s.selectCommit);
  const runOperation = useAppStore((s) => s.runOperation);

  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const [newBranchTarget, setNewBranchTarget] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ oid: string; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !session) {
      setEntries([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const reqId = Date.now();
    getBridge()
      .getReflog(session.sessionId, reqId, 200)
      .then((res) => {
        if (!active) return;
        setEntries(res.entries);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, session]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !newBranchTarget && !resetTarget) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, newBranchTarget, resetTarget]);

  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return entries;
    const q = filter.toLowerCase().trim();
    return entries.filter(
      (e) =>
        e.selector.toLowerCase().includes(q) ||
        e.oid.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.author.toLowerCase().includes(q)
    );
  }, [entries, filter]);

  const handleCopy = async (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash((cur) => (cur === hash ? null : cur)), 1500);
    } catch {}
  };

  const handleSelect = (oid: string) => {
    void selectCommit(oid);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reflog-title"
      >
        <div
          className="modal-card reflog-modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <div className="modal-title-group">
              <History size={18} className="modal-icon" />
              <div>
                <h3 id="reflog-title">{t('reflog.title')}</h3>
                <p className="modal-subtitle">{t('reflog.subtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label={t('reflog.close')}
            >
              <X size={16} />
            </button>
          </header>

          <div className="file-history-search-bar">
            <Search size={14} className="file-history-search-icon" />
            <input
              type="text"
              className="file-history-search-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar por seletor (HEAD@{1}), mensagem, hash ou autor..."
              autoFocus
            />
            {filter && (
              <button
                type="button"
                className="file-history-clear-btn"
                onClick={() => setFilter('')}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="file-history-body">
            {loading && (
              <div className="file-history-loading">
                <Clock size={20} className="spin-icon" />
                <span>Carregando reflog...</span>
              </div>
            )}

            {error && (
              <div className="file-history-error">
                <span>{error}</span>
              </div>
            )}

            {!loading && !error && filteredEntries.length === 0 && (
              <div className="file-history-empty">
                <span>{t('reflog.empty')}</span>
              </div>
            )}

            {!loading && !error && filteredEntries.length > 0 && (
              <div className="file-history-timeline">
                {filteredEntries.map((entry) => {
                  const isCopied = copiedHash === entry.oid;
                  return (
                    <div
                      key={`${entry.selector}-${entry.oid}`}
                      className="file-history-item reflog-item"
                    >
                      <div className="file-history-item-top">
                        <span className="reflog-selector-badge" title="Seletor HEAD">
                          {entry.selector}
                        </span>

                        <button
                          type="button"
                          className={`file-history-hash ${isCopied ? 'is-copied' : ''}`}
                          onClick={(e) => handleCopy(entry.oid, e)}
                          title={t('reflog.copyHash')}
                        >
                          {isCopied ? (
                            <>
                              <Check size={11} />
                              <code>{entry.oid.slice(0, 7)}</code>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <code>{entry.oid.slice(0, 7)}</code>
                            </>
                          )}
                        </button>

                        <span className="file-history-summary reflog-message" title={entry.action}>
                          {entry.action}
                        </span>

                        <div className="reflog-item-actions">
                          <button
                            type="button"
                            className="reflog-action-btn"
                            onClick={() => setNewBranchTarget(entry.oid)}
                            title={t('reflog.createBranch')}
                          >
                            <GitBranchPlus size={13} />
                          </button>
                          <button
                            type="button"
                            className="reflog-action-btn"
                            onClick={() => setResetTarget({ oid: entry.oid, message: entry.action })}
                            title={t('reflog.resetHere')}
                          >
                            <RotateCcw size={13} />
                          </button>
                          <button
                            type="button"
                            className="reflog-action-btn"
                            onClick={() => handleSelect(entry.oid)}
                            title="Visualizar commit no grafo"
                          >
                            <ExternalLink size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="file-history-item-meta">
                        <span className="file-history-author" title={entry.author}>
                          <User size={11} />
                          <strong>{entry.author}</strong>
                        </span>
                        <span className="file-history-meta-sep">•</span>
                        <time
                          className="file-history-date"
                          dateTime={new Date(entry.timestamp * 1000).toISOString()}
                          title={new Date(entry.timestamp * 1000).toLocaleString()}
                        >
                          <Calendar size={11} />
                          <span>{formatFullDate(entry.timestamp)}</span>
                        </time>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <footer className="modal-footer file-history-footer">
            <span className="file-history-count">
              {filteredEntries.length}{' '}
              {filteredEntries.length === 1 ? 'registro no reflog' : 'registros no reflog'}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              {t('reflog.close')}
            </button>
          </footer>
        </div>
      </div>

      {newBranchTarget && (
        <NewBranchModal
          isOpen={true}
          startPoint={newBranchTarget}
          onClose={() => setNewBranchTarget(null)}
          onSubmit={(params) => {
            setNewBranchTarget(null);
            void runOperation('createBranch', [], JSON.stringify(params));
          }}
        />
      )}

      {resetTarget && (
        <ResetModal
          isOpen={true}
          commitOid={resetTarget.oid}
          commitSubject={resetTarget.message}
          currentBranchName={snapshot?.branch}
          onClose={() => setResetTarget(null)}
          onConfirm={(mode) => {
            const oid = resetTarget.oid;
            setResetTarget(null);
            void runOperation('reset', [], JSON.stringify({ commitOid: oid, mode }));
          }}
        />
      )}
    </>
  );
}
