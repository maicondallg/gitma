import { useEffect, useRef, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { useI18n } from '../i18n';

export interface CreateTagModalProps {
  isOpen: boolean;
  commitOid: string;
  onClose: () => void;
  onSubmit: (params: { name: string; message?: string; oid: string; push?: boolean; force?: boolean }) => void;
}

export function CreateTagModal({
  isOpen,
  commitOid,
  onClose,
  onSubmit,
}: CreateTagModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [pushToRemote, setPushToRemote] = useState(false);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setMessage('');
      setPushToRemote(false);
      setForce(false);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('createTag.errorRequired') || 'Nome da tag é obrigatório');
      return;
    }
    if (/\s/.test(trimmed)) {
      setError(t('createTag.errorInvalid') || 'Nome da tag não pode conter espaços');
      return;
    }
    onSubmit({
      name: trimmed,
      message: message.trim() ? message.trim() : undefined,
      oid: commitOid,
      ...(pushToRemote ? { push: true } : {}),
      ...(force ? { force: true } : {}),
    });
    setName('');
    setMessage('');
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-tag-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <Tag size={18} className="modal-icon" />
            <h3 id="modal-tag-title">{t('createTag.title')}</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('createTag.cancel')}>
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-info">
            <span>{t('createTag.description', { oid: commitOid.slice(0, 7) })}</span>
            <code>{commitOid.slice(0, 7)}</code>
          </div>

          <div className="form-group">
            <label htmlFor="tag-name">{t('createTag.nameLabel')}</label>
            <input
              id="tag-name"
              ref={inputRef}
              type="text"
              className="modal-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t('createTag.namePlaceholder')}
              autoComplete="off"
              required
            />
            {error && <span className="form-error">{error}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="tag-message">{t('createTag.messageLabel')}</label>
            <textarea
              id="tag-message"
              className="modal-input modal-textarea"
              rows={3}
              placeholder={t('createTag.messagePlaceholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={pushToRemote}
              onChange={(e) => setPushToRemote(e.target.checked)}
            />
            <span>{t('createTag.pushLabel') || 'Enviar tag para o repositório remoto (push)'}</span>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            <span>{t('createTag.forceLabel') || 'Sobrescrever / mover se a tag já existir (--force)'}</span>
          </label>

          <footer className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('createTag.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              {t('createTag.submit')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
