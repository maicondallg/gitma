import { useEffect, useRef, useState } from 'react';
import { FolderOpen, FolderPlus, RefreshCw, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { getBridge } from '../lib/bridge';
import { useAppStore } from '../store/app';

export interface InitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InitModal({ isOpen, onClose }: InitModalProps) {
  const { t } = useI18n();
  const initRepository = useAppStore((s) => s.initRepository);

  const [folder, setFolder] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFolder('');
      try {
        const savedDefault = localStorage.getItem('Gitma:default-branch') || 'main';
        setDefaultBranch(savedDefault);
      } catch {
        setDefaultBranch('main');
      }
      setError(null);
      setIsInitializing(false);
      setTimeout(() => folderInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !isInitializing) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isInitializing, onClose]);

  const handleBrowseFolder = async () => {
    const bridge = getBridge();
    if (bridge.chooseFolder) {
      const picked = await bridge.chooseFolder();
      if (picked) {
        setFolder(picked);
        if (error) setError(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInitializing) return;

    const cleanFolder = folder.trim();
    const cleanBranch = defaultBranch.trim() || 'main';

    if (!cleanFolder) {
      setError(t('init.errorFolderRequired'));
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      await initRepository(cleanFolder, cleanBranch);
      onClose();
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
      setError(msg || 'Falha ao inicializar repositório.');
    } finally {
      setIsInitializing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={() => !isInitializing && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="init-modal-title"
    >
      <div className="modal-card init-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <FolderPlus size={18} className="modal-icon" />
            <h3 id="init-modal-title">{t('init.title')}</h3>
          </div>
          <button
            type="button"
            className="icon-button modal-close"
            onClick={onClose}
            disabled={isInitializing}
            aria-label={t('init.cancel')}
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="init-folder">{t('init.folderLabel')}</label>
            <div className="input-with-button">
              <input
                id="init-folder"
                ref={folderInputRef}
                type="text"
                className="modal-input"
                value={folder}
                onChange={(e) => {
                  setFolder(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t('init.folderPlaceholder')}
                disabled={isInitializing}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-secondary browse-btn"
                onClick={() => void handleBrowseFolder()}
                disabled={isInitializing}
                title={t('init.browseFolder')}
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="init-branch">{t('init.defaultBranchLabel')}</label>
            <input
              id="init-branch"
              type="text"
              className="modal-input"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              placeholder={t('init.defaultBranchPlaceholder')}
              disabled={isInitializing}
              autoComplete="off"
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <footer className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isInitializing}
            >
              {t('init.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isInitializing || !folder.trim()}
            >
              {isInitializing ? (
                <>
                  <RefreshCw size={14} className="spin" />
                  <span>{t('init.initializing')}</span>
                </>
              ) : (
                t('init.submit')
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
