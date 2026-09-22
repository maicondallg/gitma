import { useEffect, useState } from 'react';
import {
  Check,
  Edit2,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { confirmDialog, getBridge } from '../lib/bridge';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';
import type { RemoteEntry } from '../lib/types';

export interface RemotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RemotesModal({ isOpen, onClose }: RemotesModalProps) {
  const { t } = useI18n();
  const session = useAppStore((s) => s.session);
  const runOperation = useAppStore((s) => s.runOperation);
  const refresh = useAppStore((s) => s.refresh);

  const [remotes, setRemotes] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add remote form state
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Edit URL state
  const [editingRemote, setEditingRemote] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Pruning remote state
  const [pruningRemote, setPruningRemote] = useState<string | null>(null);

  const loadRemotes = async () => {
    if (!session) return;
    const bridge = getBridge();
    if (!bridge.getRemotes) return;
    setLoading(true);
    setError(null);
    try {
      const res = await bridge.getRemotes(session.sessionId, Date.now());
      setRemotes(res.remotes);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !session) {
      setRemotes([]);
      setIsAdding(false);
      setEditingRemote(null);
      setLoading(false);
      return;
    }
    void loadRemotes();
  }, [isOpen, session]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isAdding) {
          setIsAdding(false);
        } else if (editingRemote) {
          setEditingRemote(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isAdding, editingRemote]);

  const handleAddRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    setSubmittingAdd(true);
    try {
      await runOperation('addRemote', [], JSON.stringify({ name: newName.trim(), url: newUrl.trim() }));
      setNewName('');
      setNewUrl('');
      setIsAdding(false);
      await loadRemotes();
      await refresh('manual');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleEditUrl = async (remoteName: string) => {
    if (!editUrl.trim()) return;
    setSubmittingEdit(true);
    try {
      await runOperation('setRemoteUrl', [], JSON.stringify({ name: remoteName, url: editUrl.trim() }));
      setEditingRemote(null);
      setEditUrl('');
      await loadRemotes();
      await refresh('manual');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleRemoveRemote = async (remoteName: string) => {
    const confirmed = await confirmDialog(
      t('remotes.removeConfirm', { name: remoteName }),
      t('remotes.remove')
    );
    if (!confirmed) return;
    await runOperation('removeRemote', [], remoteName);
    await loadRemotes();
    await refresh('manual');
  };

  const handleFetchPrune = async (remoteName: string) => {
    setPruningRemote(remoteName);
    try {
      await runOperation('fetchPrune', [], remoteName);
      await loadRemotes();
      await refresh('manual');
    } finally {
      setPruningRemote(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="remotes-modal-title"
    >
      <div
        className="modal-card remotes-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title-group">
            <Globe className="modal-icon" size={18} />
            <div>
              <h3 id="remotes-modal-title">{t('remotes.title')}</h3>
              <p className="modal-subtitle">{t('remotes.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button modal-close"
            onClick={onClose}
            aria-label={t('common.close') || 'Fechar'}
          >
            <X size={16} />
          </button>
        </header>

        <div className="remotes-modal-body">
          <div className="remotes-toolbar">
            <span className="remotes-count-badge">
              {remotes.length} {remotes.length === 1 ? 'remote configurado' : 'remotes configurados'}
            </span>
            {!isAdding && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setIsAdding(true);
                  setNewName('');
                  setNewUrl('');
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
              >
                <Plus size={14} />
                <span>{t('remotes.addRemote')}</span>
              </button>
            )}
          </div>

          {isAdding && (
            <form onSubmit={handleAddRemote} className="remotes-add-form" style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>
                    {t('remotes.name')}
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t('remotes.namePlaceholder')}
                    autoFocus
                    required
                    style={{ width: '100%', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>
                    {t('remotes.url')}
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder={t('remotes.urlPlaceholder')}
                    required
                    style={{ width: '100%', fontSize: '12px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAdding(false)}
                  disabled={submittingAdd}
                  style={{ fontSize: '12px', padding: '4px 10px' }}
                >
                  {t('remotes.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingAdd || !newName.trim() || !newUrl.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 12px' }}
                >
                  {submittingAdd && <Loader2 size={12} className="spin" />}
                  <span>{t('remotes.save')}</span>
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '8px', color: 'var(--muted)' }}>
              <Loader2 size={16} className="spin" />
              <span>Carregando remotes...</span>
            </div>
          ) : error ? (
            <div style={{ color: 'var(--red)', padding: '12px', fontSize: '12px' }}>{error}</div>
          ) : remotes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: '13px' }}>
              {t('remotes.empty')}
            </div>
          ) : (
            <div className="remotes-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {remotes.map((remote) => {
                const isEditing = editingRemote === remote.name;
                const isPruning = pruningRemote === remote.name;

                return (
                  <div
                    key={remote.name}
                    className="remote-item-card"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                          {remote.name}
                        </span>
                        {remote.name === 'origin' && (
                          <span style={{
                            fontSize: '10px',
                            background: 'var(--raised)',
                            border: '1px solid var(--border)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            color: 'var(--muted)'
                          }}>
                            default
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary icon-btn"
                          onClick={() => handleFetchPrune(remote.name)}
                          disabled={isPruning}
                          title={t('remotes.fetchPruneTitle')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px' }}
                        >
                          <RefreshCw size={12} className={isPruning ? 'spin' : ''} />
                          <span>{t('remotes.fetchPrune')}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary icon-btn"
                          onClick={() => {
                            if (isEditing) {
                              setEditingRemote(null);
                            } else {
                              setEditingRemote(remote.name);
                              setEditUrl(remote.fetchUrl);
                            }
                          }}
                          title={t('remotes.editUrl')}
                          style={{ padding: '4px 8px' }}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary icon-btn danger-hover"
                          onClick={() => handleRemoveRemote(remote.name)}
                          title={t('remotes.remove')}
                          style={{ padding: '4px 8px', color: 'var(--red)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                        <input
                          type="text"
                          className="input"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          placeholder="URL do repositório"
                          style={{ flex: 1, fontSize: '12px' }}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleEditUrl(remote.name)}
                          disabled={submittingEdit || !editUrl.trim()}
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          {submittingEdit ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setEditingRemote(null)}
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px', color: 'var(--muted)', wordBreak: 'break-all' }}>
                        <div>
                          <strong style={{ fontSize: '11px', color: 'var(--text)' }}>Fetch:</strong> {remote.fetchUrl}
                        </div>
                        {remote.pushUrl !== remote.fetchUrl && (
                          <div>
                            <strong style={{ fontSize: '11px', color: 'var(--text)' }}>Push:</strong> {remote.pushUrl}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
