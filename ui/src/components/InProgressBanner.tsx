import { AlertTriangle, Play, SkipForward, XCircle } from 'lucide-react';
import { useAppStore } from '../store/app';

export function InProgressBanner() {
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
                <strong>Rebase em andamento:</strong>{' '}
                {inProgress.message ? `sobre ${inProgress.message}. ` : ''}
                Resolva os conflitos, prepare as alterações (stage) e continue, ou aborte.
              </span>
            </div>
            <div className="in-progress-actions">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={isLoading}
                onClick={() => void runOperation('rebaseContinue')}
                title="Continuar o rebase após resolver os arquivos"
              >
                <Play size={13} />
                <span>Continuar Rebase</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={isLoading}
                onClick={() => void runOperation('rebaseSkip')}
                title="Pular este commit e prosseguir com os próximos"
              >
                <SkipForward size={13} />
                <span>Pular Commit</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={isLoading}
                onClick={() => {
                  if (window.confirm('Tem certeza que deseja abortar o rebase? As alterações deste rebase serão descartadas.')) {
                    void runOperation('rebaseAbort');
                  }
                }}
                title="Cancelar o rebase e voltar ao estado original"
              >
                <XCircle size={13} />
                <span>Abortar Rebase</span>
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
                <strong>Merge em andamento:</strong>{' '}
                {inProgress.message ? `${inProgress.message}. ` : ''}
                Resolva os conflitos e faça o commit para concluir, ou aborte.
              </span>
            </div>
            <div className="in-progress-actions">
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={isLoading}
                onClick={() => {
                  if (window.confirm('Tem certeza que deseja abortar o merge?')) {
                    void runOperation('mergeAbort');
                  }
                }}
                title="Cancelar o merge e voltar ao estado antes do merge"
              >
                <XCircle size={13} />
                <span>Abortar Merge</span>
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
                <strong>Cherry-pick em andamento:</strong>{' '}
                Resolva os conflitos, prepare as alterações e continue, ou aborte.
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
                <span>Continuar</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={isLoading}
                onClick={() => {
                  if (window.confirm('Tem certeza que deseja abortar o cherry-pick?')) {
                    void runOperation('cherryPickAbort');
                  }
                }}
              >
                <XCircle size={13} />
                <span>Abortar</span>
              </button>
            </div>
          </>
        );

      default:
        return (
          <div className="in-progress-info">
            <AlertTriangle className="in-progress-icon" size={16} />
            <span>Operação em andamento com conflitos pendentes.</span>
          </div>
        );
    }
  };

  return <aside className="in-progress-banner" aria-label="Operação em andamento">{renderContent()}</aside>;
}
