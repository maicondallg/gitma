import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  KeyRound,
  RefreshCw,
  Sparkles,
  Terminal,
  UserCheck,
} from 'lucide-react';
import { useAppStore } from '../store/app';

export function AccountSelector() {
  const session = useAppStore((s) => s.session);
  const authState = useAppStore((s) => s.authState);
  const loadAuthState = useAppStore((s) => s.loadAuthState);
  const setRepoAccount = useAppStore((s) => s.setRepoAccount);
  const operation = useAppStore((s) => s.operation);

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (session && !authState) {
      void loadAuthState?.(false);
    }
  }, [session?.sessionId, authState, loadAuthState]);

  useEffect(() => {
    if (!menuPos) return;
    const handleDown = (e: MouseEvent | Event) => {
      const target = (e as MouseEvent).target as HTMLElement | null;
      if (target && !target.closest('.account-context-menu') && !target.closest('.account-selector-btn')) {
        setMenuPos(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuPos(null);
      }
    };
    window.addEventListener('mousedown', handleDown as EventListener);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown as EventListener);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuPos]);

  if (!session) return null;

  const selectedId = authState?.selectedId ?? 'auto';
  const resolvedId = authState?.resolvedId ?? null;
  const resolvedLabel = authState?.resolvedLabel ?? null;
  const accounts = authState?.accounts ?? [];
  const ghAccounts = accounts.filter((a) => a.kind === 'github');
  const sshAccounts = accounts.filter((a) => a.kind === 'ssh');

  const resolvedAccount = accounts.find((a) => a.id === resolvedId) ?? null;

  const displayLabel =
    selectedId === 'system'
      ? 'Sistema'
      : resolvedLabel
      ? resolvedLabel.replace(/ \(SSH\)$/, '')
      : 'Auto';

  const reasonLabel = (() => {
    switch (authState?.resolutionReason) {
      case 'owner-match':
        return 'Detectado pelo dono da URL remota';
      case 'heuristic':
        return 'Detectado pelo nome/organização do remote';
      case 'verified':
        return 'Verificado automaticamente em operação anterior';
      case 'gh-active':
        return 'Conta ativa do GitHub CLI (com fallback automático)';
      case 'manual':
        return 'Fixado manualmente para este repositório';
      case 'system':
        return 'Usando configuração global do sistema';
      default:
        return 'Seleção automática de credencial';
    }
  })();

  const handleSelect = async (id: string) => {
    setMenuPos(null);
    await setRepoAccount?.(id);
  };

  const handleRefreshAccounts = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setReloading(true);
    try {
      await loadAuthState?.(true);
    } finally {
      setReloading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="tab-bar-action-btn account-selector-btn"
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setMenuPos(menuPos ? null : { x: rect.right - 300, y: rect.bottom });
        }}
        disabled={!!operation}
        title={`Conta/Credencial do repositório: ${resolvedLabel || displayLabel}\nModo: ${
          selectedId === 'auto' ? 'Automático' : selectedId === 'system' ? 'Sistema' : 'Manual'
        }\n${reasonLabel}`}
        aria-label="Selecionar conta Git/GitHub"
        style={{
          width: 'auto',
          padding: '0 8px',
          gap: '5px',
          fontSize: '11px',
          maxWidth: '210px',
        }}
      >
        <UserCheck size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '130px',
            fontWeight: 500,
          }}
        >
          {displayLabel}
        </span>
        {selectedId === 'auto' && (
          <span
            style={{
              fontSize: '9px',
              padding: '1px 4px',
              borderRadius: '3px',
              background: 'var(--raised)',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              flexShrink: 0,
            }}
          >
            Auto
          </span>
        )}
        <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
      </button>

      {menuPos &&
        createPortal(
          <div
            className="push-context-menu account-context-menu"
            style={{
              top: `${Math.max(8, Math.min(menuPos.y + 4, window.innerHeight - 360))}px`,
              left: `${Math.max(8, Math.min(menuPos.x, window.innerWidth - 310))}px`,
              width: '300px',
              maxHeight: '380px',
              overflowY: 'auto',
              zIndex: 99999,
            }}
            role="menu"
          >
            <div
              className="menu-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserCheck size={12} />
                <span>Conta / Credencial Git</span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={handleRefreshAccounts}
                title="Recarregar contas do GitHub CLI (gh) e chaves SSH"
                style={{ width: '20px', height: '20px', padding: 0 }}
              >
                <RefreshCw size={11} className={reloading ? 'spin' : ''} />
              </button>
            </div>

            {/* Opção 1: Automático */}
            <button
              type="button"
              className="menu-action-item"
              onClick={() => void handleSelect('auto')}
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
                <Sparkles size={14} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--accent)' }} />
                <div className="menu-action-text-col" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: selectedId === 'auto' ? 600 : 400 }}>
                    Automático (Recomendado)
                  </span>
                  <small style={{ whiteSpace: 'normal', lineHeight: 1.3 }}>
                    {resolvedAccount
                      ? `Usando: ${resolvedAccount.label}${
                          resolvedAccount.sshKeyName ? ` (SSH: ${resolvedAccount.sshKeyName})` : ''
                        }`
                      : 'Detecta pelo remote e tenta outra conta se falhar'}
                  </small>
                </div>
              </div>
              {selectedId === 'auto' && <Check size={14} style={{ color: 'var(--green)', flexShrink: 0, marginTop: '2px' }} />}
            </button>

            {ghAccounts.length > 0 && (
              <>
                <div className="menu-separator" />
                <div
                  style={{
                    padding: '4px 10px 2px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Contas GitHub ({ghAccounts.length})
                </div>
                {ghAccounts.map((acc) => {
                  const isSelected = selectedId === acc.id;
                  const isAutoActive = selectedId === 'auto' && resolvedId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      className="menu-action-item"
                      onClick={() => void handleSelect(acc.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <UserCheck
                          size={14}
                          style={{
                            flexShrink: 0,
                            color: isSelected || isAutoActive ? 'var(--green)' : 'var(--muted)',
                          }}
                        />
                        <div className="menu-action-text-col" style={{ minWidth: 0 }}>
                          <span
                            style={{
                              fontWeight: isSelected || isAutoActive ? 600 : 400,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {acc.label}
                          </span>
                          <small>
                            {acc.sshKeyName
                              ? `SSH (${acc.sshKeyName}) + Token gh`
                              : 'Token HTTPS (gh)'}
                          </small>
                        </div>
                      </div>
                      {isSelected ? (
                        <Check size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
                      ) : isAutoActive ? (
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'var(--raised)',
                            color: 'var(--green)',
                            border: '1px solid var(--border)',
                            flexShrink: 0,
                          }}
                        >
                          Em uso
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </>
            )}

            {sshAccounts.length > 0 && (
              <>
                <div className="menu-separator" />
                <div
                  style={{
                    padding: '4px 10px 2px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Chaves SSH (~/.ssh)
                </div>
                {sshAccounts.map((acc) => {
                  const isSelected = selectedId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      className="menu-action-item"
                      onClick={() => void handleSelect(acc.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <KeyRound size={13} style={{ flexShrink: 0, color: 'var(--muted)' }} />
                        <div className="menu-action-text-col" style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                            {acc.sshKeyName || acc.label}
                          </span>
                          <small>{acc.sshKeyPath}</small>
                        </div>
                      </div>
                      {isSelected && <Check size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </>
            )}

            <div className="menu-separator" />
            <button
              type="button"
              className="menu-action-item"
              onClick={() => void handleSelect('system')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={13} style={{ flexShrink: 0, color: 'var(--muted)' }} />
                <div className="menu-action-text-col">
                  <span style={{ fontWeight: selectedId === 'system' ? 600 : 400 }}>
                    Padrão do Sistema
                  </span>
                  <small>Usar git/ssh global sem intervenção do Gitma</small>
                </div>
              </div>
              {selectedId === 'system' && <Check size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />}
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
