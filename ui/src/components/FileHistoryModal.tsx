import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  History,
  Search,
  User,
  X,
} from 'lucide-react';
import { getBridge } from '../lib/bridge';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';
import type { FileHistoryEntry } from '../lib/types';
import { formatFullDate } from './FilesPanel';

export interface FileHistoryModalProps {
  filePath: string | null;
  onClose: () => void;
}

export function FileHistoryModal({ filePath, onClose }: FileHistoryModalProps) {
  const { t } = useI18n();
  const session = useAppStore((s) => s.session);
  const selectCommit = useAppStore((s) => s.selectCommit);

  const [entries, setEntries] = useState<FileHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath || !session) {
      setEntries([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const reqId = Date.now();
    getBridge()
      .getFileHistory(session.sessionId, reqId, filePath, 150)
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
  }, [filePath, session]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!filePath) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filePath, onClose]);

  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return entries;
    const q = filter.toLowerCase().trim();
    return entries.filter(
      (e) =>
        e.oid.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.author.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q)
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

  if (!filePath) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-history-title"
    >
      <div
        className="modal-card file-history-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title-group">
            <History size={18} className="modal-icon" />
            <div>
              <h3 id="file-history-title">{t('fileHistory.title')}</h3>
              <p className="modal-subtitle">
                {t('fileHistory.subtitle', { path: filePath })}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('fileHistory.close')}
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
            placeholder="Filtrar por mensagem, autor ou hash..."
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
              <span>Carregando histórico do arquivo...</span>
            </div>
          )}

          {error && (
            <div className="file-history-error">
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && filteredEntries.length === 0 && (
            <div className="file-history-empty">
              <span>{t('fileHistory.noEntries')}</span>
            </div>
          )}

          {!loading && !error && filteredEntries.length > 0 && (
            <div className="file-history-timeline">
              {filteredEntries.map((entry) => {
                const isCopied = copiedHash === entry.oid;
                return (
                  <div
                    key={entry.oid}
                    className="file-history-item"
                    onClick={() => handleSelect(entry.oid)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(entry.oid);
                      }
                    }}
                    title={t('fileHistory.selectCommit')}
                  >
                    <div className="file-history-item-top">
                      <button
                        type="button"
                        className={`file-history-hash ${isCopied ? 'is-copied' : ''}`}
                        onClick={(e) => handleCopy(entry.oid, e)}
                        title="Copiar hash completo"
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

                      <span className="file-history-summary" title={entry.summary}>
                        {entry.summary}
                      </span>

                      <button
                        type="button"
                        className="file-history-jump-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(entry.oid);
                        }}
                        title="Visualizar este commit no grafo"
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>

                    <div className="file-history-item-meta">
                      <span className="file-history-author" title={`${entry.author} <${entry.email}>`}>
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
            {filteredEntries.length === 1 ? 'commit encontrado' : 'commits encontrados'}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            {t('fileHistory.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
