import { useEffect, useRef, useState } from 'react';
import { Archive, X } from 'lucide-react';
import { useI18n } from '../i18n';

export interface StashModalProps {
  isOpen: boolean;
  initialIncludeUntracked?: boolean;
  onClose: () => void;
  onSubmit: (params: { message: string; includeUntracked: boolean }) => void;
}

export function StashModal({
  isOpen,
  initialIncludeUntracked = false,
  onClose,
  onSubmit,
}: StashModalProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(initialIncludeUntracked);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setIncludeUntracked(initialIncludeUntracked);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialIncludeUntracked]);

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
    onSubmit({ message: message.trim(), includeUntracked });
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stash-modal-title"
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <Archive size={18} className="modal-icon" />
            <h3 id="stash-modal-title">{t('stashModal.title')}</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('stashModal.cancel')}
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="stash-message">{t('stashModal.messageLabel')}</label>
            <input
              id="stash-message"
              ref={inputRef}
              type="text"
              className="modal-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('stashModal.messagePlaceholder')}
              autoComplete="off"
            />
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
            />
            <span>{t('stashModal.includeUntrackedLabel')}</span>
          </label>

          <footer className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('stashModal.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('stashModal.submit')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
