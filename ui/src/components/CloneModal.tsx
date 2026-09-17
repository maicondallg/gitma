import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, RefreshCw, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { getBridge } from '../lib/bridge';
import { useAppStore } from '../store/app';

export interface CloneModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CloneModal({ isOpen, onClose }: CloneModalProps) {
  const { t } = useI18n();
  const cloneRepository = useAppStore((s) => s.cloneRepository);

  const [source, setSource] = useState('');
  const [destFolder, setDestFolder] = useState('');
  const [destName, setDestName] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSource('');
      setDestFolder('');
      setDestName('');
      setError(null);
      setIsCloning(false);
      setTimeout(() => sourceInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !isCloning) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isCloning, onClose]);

  const handleSourceChange = (val: string) => {
    setSource(val);
    if (error) setError(null);

    // Auto-infer destination folder name from source if destName is empty or matches previous auto-infer
    const trimmed = val.trim().replace(/\/+$/, '');
    if (trimmed) {
      const parts = trimmed.split(/[/\\\\]/);
      let lastPart = parts.pop() || '';
      if (lastPart.endsWith('.git')) {
        lastPart = lastPart.slice(0, -4);
      }
      if (lastPart && (!destName || destName === '')) {
        setDestName(lastPart);
      }
    }
  };

  const handleBrowseSourceFolder = async () => {
    const bridge = getBridge();
    if (bridge.chooseFolder) {
      const picked = await bridge.chooseFolder();
      if (picked) {
        handleSourceChange(picked);
      }
    }
  };

  const handleBrowseDestFolder = async () => {
    const bridge = getBridge();
    if (bridge.chooseFolder) {
      const picked = await bridge.chooseFolder();
      if (picked) {
        setDestFolder(picked);
        if (error) setError(null);
      }
    }
  };

  const fullDestinationPath =
    destFolder && destName
      ? destFolder.endsWith('/') || destFolder.endsWith('\\')
        ? `${destFolder}${destName}`
        : `${destFolder}/${destName}`
      : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCloning) return;

    const cleanSource = source.trim();
    const cleanDestFolder = destFolder.trim();
    const cleanDestName = destName.trim();

    if (!cleanSource) {
      setError(t('clone.errorSourceRequired'));
      return;
    }
    if (!cleanDestFolder) {
      setError(t('clone.errorDestRequired'));
      return;
    }
    if (!cleanDestName) {
      setError(t('clone.errorNameRequired'));
      return;
    }

    setIsCloning(true);
    setError(null);

    try {
      const finalPath =
        cleanDestFolder.endsWith('/') || cleanDestFolder.endsWith('\\')
          ? `${cleanDestFolder}${cleanDestName}`
          : `${cleanDestFolder}/${cleanDestName}`;

      await cloneRepository(cleanSource, finalPath);
      onClose();
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
      setError(msg || 'Falha ao clonar repositório.');
    } finally {
      setIsCloning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={() => !isCloning && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clone-modal-title"
    >
      <div className="modal-card clone-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <Download size={18} className="modal-icon" />
            <h3 id="clone-modal-title">{t('clone.title')}</h3>
          </div>
          <button
            type="button"
            className="icon-button modal-close"
            onClick={onClose}
            disabled={isCloning}
            aria-label={t('clone.cancel')}
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Origem */}
          <div className="form-group">
            <label htmlFor="clone-source">{t('clone.sourceLabel')}</label>
            <div className="input-with-button">
              <input
                id="clone-source"
                ref={sourceInputRef}
                type="text"
                className="modal-input"
                value={source}
                onChange={(e) => handleSourceChange(e.target.value)}
                placeholder={t('clone.sourcePlaceholder')}
                disabled={isCloning}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-secondary browse-btn"
                onClick={() => void handleBrowseSourceFolder()}
                disabled={isCloning}
                title={t('clone.browseSource')}
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          {/* Diretório Pai de Destino */}
          <div className="form-group">
            <label htmlFor="clone-dest-folder">{t('clone.destinationFolderLabel')}</label>
            <div className="input-with-button">
              <input
                id="clone-dest-folder"
                type="text"
                className="modal-input"
                value={destFolder}
                onChange={(e) => {
                  setDestFolder(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="/home/usuario/projetos"
                disabled={isCloning}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-secondary browse-btn"
                onClick={() => void handleBrowseDestFolder()}
                disabled={isCloning}
                title={t('clone.browseDestination')}
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          {/* Nome da Pasta */}
          <div className="form-group">
            <label htmlFor="clone-dest-name">{t('clone.destinationNameLabel')}</label>
            <input
              id="clone-dest-name"
              type="text"
              className="modal-input"
              value={destName}
              onChange={(e) => {
                setDestName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t('clone.destinationNamePlaceholder')}
              disabled={isCloning}
              autoComplete="off"
            />
          </div>

          {/* Prévia do Caminho Final */}
          {fullDestinationPath && (
            <div className="form-info clone-preview-info">
              <span>{t('clone.fullPathPreview')}</span>
              <code>{fullDestinationPath}</code>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          {isCloning && (
            <div className="clone-progress-status">
              <RefreshCw size={15} className="spin" />
              <span>{t('clone.cloningWait')}</span>
            </div>
          )}

          <footer className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isCloning}
            >
              {t('clone.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isCloning || !source.trim() || !destFolder.trim() || !destName.trim()}
            >
              {isCloning ? (
                <>
                  <RefreshCw size={14} className="spin" />
                  <span>{t('clone.cloning')}</span>
                </>
              ) : (
                t('clone.submit')
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
