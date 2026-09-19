import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { useI18n } from '../i18n';

export interface ResetModalProps {
  isOpen: boolean;
  commitOid: string;
  commitSubject?: string;
  currentBranchName?: string | null;
  onClose: () => void;
  onConfirm: (mode: 'mixed' | 'soft' | 'hard') => void;
}

export function ResetModal({
  isOpen,
  commitOid,
  commitSubject,
  currentBranchName,
  onClose,
  onConfirm,
}: ResetModalProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'mixed' | 'soft' | 'hard'>('mixed');

  useEffect(() => {
    if (isOpen) {
      setMode('mixed');
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
    onConfirm(mode);
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
    >
      <div className="modal-card reset-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <RotateCcw size={18} className="modal-icon" />
            <h3 id="reset-modal-title">
              {t('reset.title', { target: currentBranchName ? `branch (${currentBranchName})` : 'HEAD' })}
            </h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('reset.cancel')}
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="reset-modal-target">
            <div className="reset-target-row">
              <span className="reset-target-label">{t('reset.targetCommit')}</span>
              <code className="reset-target-oid">{commitOid.slice(0, 7)}</code>
            </div>
            {commitSubject && (
              <div className="reset-target-subject" title={commitSubject}>
                {commitSubject}
              </div>
            )}
          </div>

          <div className="reset-options-group">
            <label
              className={`reset-option-card ${mode === 'mixed' ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="reset-mode"
                value="mixed"
                checked={mode === 'mixed'}
                onChange={() => setMode('mixed')}
              />
              <div className="reset-option-info">
                <div className="reset-option-title">
                  <strong>{t('reset.mixedTitle')}</strong>
                  <span className="reset-option-badge">{t('reset.badgeDefault')}</span>
                </div>
                <div className="reset-option-desc">
                  {t('reset.mixedDesc')}
                </div>
              </div>
            </label>

            <label
              className={`reset-option-card ${mode === 'soft' ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="reset-mode"
                value="soft"
                checked={mode === 'soft'}
                onChange={() => setMode('soft')}
              />
              <div className="reset-option-info">
                <div className="reset-option-title">
                  <strong>{t('reset.softTitle')}</strong>
                </div>
                <div className="reset-option-desc">
                  {t('reset.softDesc')}
                </div>
              </div>
            </label>

            <label
              className={`reset-option-card ${mode === 'hard' ? 'active danger' : ''}`}
            >
              <input
                type="radio"
                name="reset-mode"
                value="hard"
                checked={mode === 'hard'}
                onChange={() => setMode('hard')}
              />
              <div className="reset-option-info">
                <div className="reset-option-title danger-text">
                  <strong>{t('reset.hardTitle')}</strong>
                  <span className="reset-option-badge danger">{t('reset.badgeDestructive')}</span>
                </div>
                <div className="reset-option-desc">
                  {t('reset.hardDesc')}
                </div>
              </div>
            </label>
          </div>

          {mode === 'hard' && (
            <div className="reset-warning-box">
              <AlertTriangle size={16} />
              <span>
                {t('reset.hardWarning')}
              </span>
            </div>
          )}

          <footer className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('reset.cancel')}
            </button>
            <button
              type="submit"
              className={`btn ${mode === 'hard' ? 'btn-danger' : 'btn-primary'}`}
            >
              {mode === 'hard' ? t('reset.submitHard') : t('reset.submitNormal')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
