import { useEffect, useRef, useState } from 'react';
import { GitBranch, X } from 'lucide-react';
import { useI18n } from '../i18n';

export interface NewBranchModalProps {
  isOpen: boolean;
  startPoint?: string;
  onClose: () => void;
  onSubmit: (params: { name: string; startPoint?: string; checkout: boolean }) => void;
}

export function NewBranchModal({ isOpen, startPoint, onClose, onSubmit }: NewBranchModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setCheckout(true);
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
    const cleanName = name.trim();
    if (!cleanName) {
      setError(t('newBranch.errorRequired'));
      return;
    }
    if (/\s/.test(cleanName) || /[~^:?*\[\\]/.test(cleanName)) {
      setError(t('newBranch.errorInvalid'));
      return;
    }
    onSubmit({ name: cleanName, startPoint: startPoint || undefined, checkout });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <GitBranch size={18} className="modal-icon" />
            <h3 id="modal-title">{t('newBranch.title')}</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('newBranch.cancel')}>
            <X size={16} />
          </button>
        </header>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="branch-name">{t('newBranch.nameLabel')}</label>
            <input
              id="branch-name"
              ref={inputRef}
              type="text"
              className="modal-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t('newBranch.namePlaceholder')}
              autoComplete="off"
            />
            {error && <span className="form-error">{error}</span>}
          </div>

          {startPoint && (
            <div className="form-info">
              <span>{t('newBranch.startPoint')}</span>
              <code>{startPoint}</code>
            </div>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={checkout}
              onChange={(e) => setCheckout(e.target.checked)}
            />
            <span>{t('newBranch.checkoutLabel')}</span>
          </label>

          <footer className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('newBranch.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              {t('newBranch.submit')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
