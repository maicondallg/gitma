import { AlertTriangle, Play, SkipForward, XCircle } from 'lucide-react';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';

export function InProgressBanner() {
  const { t } = useI18n();
  const snapshot = useAppStore((state) => state.snapshot);
  const runOperation = useAppStore((state) => state.runOperation);
  const operation = useAppStore((state) => state.operation);

  const inProgress = snapshot?.inProgress;
  if (!inProgress) return null;

  const isLoading = Boolean(operation);

  const renderContent = () => {
    switch (inProgress.kind) {
      case 'rebase':
        return (
          <>
            <div className="in-progress-info">
              <AlertTriangle className="in-progress-icon" size={16} />
              <span>
                <strong>{t('inProgress.rebaseTitle')}</strong>{' '}
                {inProgress.message ? t('inProgress.rebaseOnto', { msg: inProgress.message }) + ' ' : ''}
                {t('inProgress.rebaseDesc')}
              </span>
            </div>
            <div className="in-progress-actions">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={isLoading}
                onClick={() => void runOperation('rebaseContinue')}
                title={t('inProgress.rebaseContinueTitle')}
              >
                <Play size={13} />
                <span>{t('inProgress.rebaseContinue')}</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={isLoading}
                onClick={() => void runOperation('rebaseSkip')}
                title={t('inProgress.rebaseSkipTitle')}
              >
                <SkipForward size={13} />
                <span>{t('inProgress.rebaseSkip')}</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={isLoading}
                onClick={() => {
                  if (window.confirm(t('inProgress.rebaseAbortConfirm'))) {
                    void runOperation('rebaseAbort');
                  }
                }}
                title={t('inProgress.rebaseAbortTitle')}
              >
                <XCircle size={13} />
                <span>{t('inProgress.rebaseAbort')}</span>
              </button>
            </div>
          </>
        );

      case 'merge':
        return (
          <>
            <div className="in-progress-info">
              <AlertTriangle className="in-progress-icon" size={16} />
              <span>
                <strong>{t('inProgress.mergeTitle')}</strong>{' '}
                {inProgress.message ? `${inProgress.message}. ` : ''}
                {t('inProgress.mergeDesc')}
              </span>
            </div>
            <div className="in-progress-actions">
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={isLoading}
                onClick={() => {
                  if (window.confirm(t('inProgress.mergeAbortConfirm'))) {
                    void runOperation('mergeAbort');
                  }
                }}
                title={t('inProgress.mergeAbortTitle')}
              >
                <XCircle size={13} />
                <span>{t('inProgress.mergeAbort')}</span>
              </button>
            </div>
          </>
        );

      case 'cherryPick':
        return (
          <>
            <div className="in-progress-info">
              <AlertTriangle className="in-progress-icon" size={16} />
              <span>
                <strong>{t('inProgress.cherryPickTitle')}</strong>{' '}
                {t('inProgress.cherryPickDesc')}
              </span>
            </div>
            <div className="in-progress-actions">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={isLoading}
                onClick={() => void runOperation('cherryPickContinue')}
              >
                <Play size={13} />
                <span>{t('inProgress.continue')}</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={isLoading}
                onClick={() => {
                  if (window.confirm(t('inProgress.cherryPickAbortConfirm'))) {
                    void runOperation('cherryPickAbort');
                  }
                }}
              >
                <XCircle size={13} />
                <span>{t('inProgress.abort')}</span>
              </button>
            </div>
          </>
        );

      default:
        return (
          <div className="in-progress-info">
            <AlertTriangle className="in-progress-icon" size={16} />
            <span>{t('inProgress.generic')}</span>
          </div>
        );
    }
  };

  return <aside className="in-progress-banner" aria-label={t('inProgress.ariaLabel')}>{renderContent()}</aside>;
}
