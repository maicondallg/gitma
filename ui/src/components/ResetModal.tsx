import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';

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
              Resetar {currentBranchName ? `branch (${currentBranchName})` : 'HEAD'}
            </h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar modal"
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="reset-modal-target">
            <div className="reset-target-row">
              <span className="reset-target-label">Commit alvo:</span>
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
                  <strong>Misto (--mixed)</strong>
                  <span className="reset-option-badge">Padrão</span>
                </div>
                <div className="reset-option-desc">
                  Move a branch para o commit alvo e mantém as alterações nos arquivos locais
                  fora do stage (prontas para revisão).
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
                  <strong>Suave (--soft)</strong>
                </div>
                <div className="reset-option-desc">
                  Move a branch para o commit alvo e mantém todas as alterações preparadas no
                  stage (prontas para novo commit).
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
                  <strong>Rígido (--hard)</strong>
                  <span className="reset-option-badge danger">Destrutivo</span>
                </div>
                <div className="reset-option-desc">
                  Descarta permanentemente todas as alterações nos arquivos e no stage feitas após
                  este commit.
                </div>
              </div>
            </label>
          </div>

          {mode === 'hard' && (
            <div className="reset-warning-box">
              <AlertTriangle size={16} />
              <span>
                Atenção: todas as alterações não commitadas e arquivos modificados desde este
                commit serão permanentemente descartados.
              </span>
            </div>
          )}

          <footer className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className={`btn ${mode === 'hard' ? 'btn-danger' : 'btn-primary'}`}
            >
              {mode === 'hard' ? 'Resetar (Descartar alterações)' : 'Resetar branch'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
