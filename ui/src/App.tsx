import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Archive,
  ArrowDownToLine,
  CheckCircle2,
  Download,
  GitBranch,
  GitBranchPlus,
  GitFork,
  HelpCircle,
  RefreshCw,
  Settings,
  ShieldAlert,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CommitForm } from './components/CommitForm';
import { DiffPanel } from './components/DiffPanel';
import { FilesPanel } from './components/FilesPanel';
import { GraphPanel } from './components/GraphPanel';
import { HomeTab } from './components/HomeTab';
import { InProgressBanner } from './components/InProgressBanner';
import { NewBranchModal } from './components/NewBranchModal';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { TabBar } from './components/TabBar';
import { useI18n } from './i18n';
import { useAppStore } from './store/app';
import type { Operation } from './lib/types';

const LAYOUT_KEY = 'Gitma:panel-layout-v2';

function savedLayout(): number[] | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}



export default function App() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const session = useAppStore((s) => s.session);
  const snapshot = useAppStore((s) => s.snapshot);
  const notice = useAppStore((s) => s.notice);
  const refreshing = useAppStore((s) => s.refreshing);
  const opening = useAppStore((s) => s.opening);
  const openRepository = useAppStore((s) => s.openRepository);
  const openRepositories = useAppStore((s) => s.openRepositories);
  const closeTab = useAppStore((s) => s.closeTab);
  const closeOtherTabs = useAppStore((s) => s.closeOtherTabs);
  const switchTab = useAppStore((s) => s.switchTab);
  const refresh = useAppStore((s) => s.refresh);
  const dismissNotice = useAppStore((s) => s.dismissNotice);
  const runOperation = useAppStore((s) => s.runOperation);
  const operation = useAppStore((s) => s.operation);
  const expandedDiff = useAppStore((s) => s.expandedDiff);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const closeSettings = useAppStore((s) => s.closeSettings);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const { t } = useI18n();

  const [showNewBranchModal, setShowNewBranchModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [pushMenu, setPushMenu] = useState<{ x: number; y: number } | null>(null);
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!pushMenu && !stashMenu) return;
    const handleDown = (e: MouseEvent | Event) => {
      const target = (e as MouseEvent).target as HTMLElement | null;
      if (target && !target.closest('.push-context-menu')) {
        setPushMenu(null);
      }
      if (target && !target.closest('.stash-context-menu')) {
        setStashMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPushMenu(null);
        setStashMenu(null);
      }
    };
    window.addEventListener('mousedown', handleDown as EventListener);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown as EventListener);
      window.removeEventListener('keydown', handleKey);
    };
  }, [pushMenu, stashMenu]);

  useEffect(() => {
    let lastFocusTime = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusTime < 1000) return;
      lastFocusTime = now;
      void refresh('focus');
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setShowShortcutsModal((v) => !v);
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) return;

      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openRepository();
      } else if (event.key.toLowerCase() === 'n' || event.key.toLowerCase() === 't') {
        event.preventDefault();
        void openRepositories();
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        void refresh('manual');
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        if (session) setShowNewBranchModal(true);
      } else if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        if (activeTabId !== 'home') {
          if (event.shiftKey) {
            void closeOtherTabs(activeTabId);
          } else {
            void closeTab(activeTabId);
          }
        }
      } else if (event.key === '/' || event.key === '?') {
        event.preventDefault();
        setShowShortcutsModal((v) => !v);
      } else if (event.key === ',') {
        event.preventDefault();
        toggleSettings();
      } else if (event.key >= '1' && event.key <= '8') {
        event.preventDefault();
        const tabIdx = parseInt(event.key, 10) - 1;
        if (tabIdx < tabs.length) {
          void switchTab(tabs[tabIdx].id);
        }
      } else if (event.key === '9') {
        event.preventDefault();
        if (tabs.length > 0) {
          void switchTab(tabs[tabs.length - 1].id);
        }
      } else if (event.key === 'Tab') {
        // Alterna entre abas com Ctrl+Tab e Ctrl+Shift+Tab
        event.preventDefault();
        if (tabs.length === 0) return;
        const allTabIds = ['home', ...tabs.map((t) => t.id)];
        const currentIndex = allTabIds.indexOf(activeTabId);
        if (event.shiftKey) {
          const prevIndex = (currentIndex - 1 + allTabIds.length) % allTabIds.length;
          void switchTab(allTabIds[prevIndex]);
        } else {
          const nextIndex = (currentIndex + 1) % allTabIds.length;
          void switchTab(allTabIds[nextIndex]);
        }
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKey);
    };
  }, [activeTabId, closeOtherTabs, closeTab, openRepositories, openRepository, refresh, session, switchTab, tabs]);

  return (
    <main className="app-shell">
      {/* Barra Superior Horizontal de Abas */}
      <TabBar />

      {activeTabId === 'home' || !session ? (
        <HomeTab />
      ) : (
        <>
          <header className="app-toolbar">
            <div className="toolbar-left">
              <strong className="repo-name">{session.name}</strong>
              {snapshot?.branch ? (
                <span className="branch-badge" title={t('toolbar.currentBranchCheckedOut')}>
                  <GitBranch size={13} />
                  <span>{snapshot.branch}</span>
                  <span className="branch-badge-dot">•</span>
                </span>
              ) : snapshot ? (
                <span className="branch-badge branch-badge-detached" title={t('toolbar.detachedHead')}>
                  <GitBranch size={13} />
                  <span>HEAD ({t('toolbar.detached')})</span>
                  <span className="branch-badge-dot">•</span>
                </span>
              ) : null}
            </div>

            <div className="toolbar-actions toolbar-center">
              {/* Grupo 1: Sincronização remota (Fetch, Pull, Push) */}
              <div className="toolbar-group" role="group" aria-label={t('toolbar.remoteSync')}>
                <button
                  className="sync-button"
                  onClick={() => void runOperation('fetch')}
                  disabled={!!operation}
                  title={t('toolbar.fetchTitle')}
                >
                  <ArrowDownToLine size={14} />
                  <span>{t('toolbar.fetch')}</span>
                </button>
                <button
                  className="sync-button"
                  onClick={() => void runOperation('pull')}
                  disabled={!!operation}
                  title={t('toolbar.pullTitle')}
                >
                  <Download size={14} />
                  <span>{t('toolbar.pull')}</span>
                </button>
                <button
                  className="sync-button"
                  onClick={() => void runOperation('push')}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStashMenu(null);
                    setPushMenu({ x: e.clientX, y: e.clientY });
                  }}
                  disabled={!!operation}
                  title={t('toolbar.pushTitle')}
                >
                  <Upload size={14} />
                  <span>{t('toolbar.push')}</span>
                </button>
              </div>

              <div className="toolbar-divider" />

              {/* Grupo 2: Branches e Stash */}
              <div className="toolbar-group" role="group" aria-label={t('toolbar.localMgmt')}>
                <button
                  className="sync-button"
                  onClick={() => setShowNewBranchModal(true)}
                  disabled={!!operation}
                  title={t('toolbar.newBranchTitle')}
                >
                  <GitBranchPlus size={14} />
                  <span>{t('toolbar.newBranch')}</span>
                </button>
                <button
                  className="sync-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPushMenu(null);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setStashMenu(stashMenu ? null : { x: rect.left, y: rect.bottom });
                  }}
                  disabled={!!operation}
                  title={t('toolbar.stashTitle')}
                >
                  <Archive size={14} />
                  <span>{t('toolbar.stash')}</span>
                </button>
              </div>

              <div className="toolbar-divider" />

              {/* Grupo 3: Recarregar */}
              <div className="toolbar-group" role="group" aria-label={t('toolbar.refresh')}>
                <button
                  className="icon-button"
                  onClick={() => void refresh('manual')}
                  disabled={refreshing}
                  title={t('toolbar.refreshTitle')}
                >
                  <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                </button>
              </div>
            </div>

            <div className="toolbar-right" />

            {stashMenu &&
              createPortal(
                <div
                  className="push-context-menu stash-context-menu"
                  style={{
                    top: `${Math.max(8, Math.min(stashMenu.y + 4, window.innerHeight - 260))}px`,
                    left: `${Math.max(8, Math.min(stashMenu.x - 70, window.innerWidth - 240))}px`,
                    zIndex: 99999,
                  }}
                  role="menu"
                >
                <div className="menu-header">
                  <Archive size={12} />
                  <span>{t('toolbar.stashOptions')}</span>
                </div>

                <button
                  type="button"
                  className="menu-action-item"
                  onClick={() => {
                    setStashMenu(null);
                    void runOperation('stashPush', [], '');
                  }}
                  disabled={!!operation}
                  title={t('toolbar.stashSaveDesc')}
                >
                  <Archive size={13} />
                  <span>{t('toolbar.stashSave')}</span>
                </button>

                <button
                  type="button"
                  className="menu-action-item"
                  onClick={() => {
                    setStashMenu(null);
                    const msg = window.prompt(t('toolbar.stashSaveMsgPrompt'));
                    if (msg !== null) {
                      void runOperation('stashPush', [], JSON.stringify({ message: msg, include_untracked: false }));
                    }
                  }}
                  disabled={!!operation}
                  title={t('toolbar.stashSaveMsgDesc')}
                >
                  <Archive size={13} />
                  <span>{t('toolbar.stashSaveMsg')}</span>
                </button>

                <button
                  type="button"
                  className="menu-action-item"
                  onClick={() => {
                    setStashMenu(null);
                    void runOperation('stashPush', [], JSON.stringify({ message: '', include_untracked: true }));
                  }}
                  disabled={!!operation}
                  title={t('toolbar.stashSaveUntrackedDesc')}
                >
                  <Archive size={13} />
                  <span>{t('toolbar.stashSaveUntracked')}</span>
                </button>

                <div className="menu-separator" />

                <button
                  type="button"
                  className="menu-action-item"
                  onClick={() => {
                    setStashMenu(null);
                    void runOperation('stashPop');
                  }}
                  disabled={!!operation}
                  title={t('toolbar.stashPopDesc')}
                >
                  <Download size={13} />
                  <span>{t('toolbar.stashPop')}</span>
                </button>

                <button
                  type="button"
                  className="menu-action-item"
                  onClick={() => {
                    setStashMenu(null);
                    void runOperation('stashApply');
                  }}
                  disabled={!!operation}
                  title={t('toolbar.stashApplyDesc')}
                >
                  <Download size={13} />
                  <span>{t('toolbar.stashApply')}</span>
                </button>

                <button
                  type="button"
                  className="menu-action-item menu-action-danger"
                  onClick={() => {
                    setStashMenu(null);
                    if (window.confirm(t('toolbar.stashDropConfirm'))) {
                      void runOperation('stashDrop');
                    }
                  }}
                  disabled={!!operation}
                  title={t('toolbar.stashDropDesc')}
                >
                  <X size={13} />
                  <span>{t('toolbar.stashDrop')}</span>
                </button>
              </div>,
              document.body
            )}

            {pushMenu &&
              createPortal(
                <div
                  className="push-context-menu"
                  style={{
                    top: `${Math.max(8, Math.min(pushMenu.y + 4, window.innerHeight - 150))}px`,
                    left: `${Math.max(8, Math.min(pushMenu.x - 140, window.innerWidth - 240))}px`,
                    zIndex: 99999,
                  }}
                  role="menu"
                >
                  <div className="menu-header">
                    <Upload size={12} />
                    <span>{t('toolbar.pushOptions')}</span>
                  </div>

                  <button
                    type="button"
                    className="menu-action-item"
                    onClick={() => {
                      setPushMenu(null);
                      void runOperation('push');
                    }}
                    disabled={!!operation}
                  >
                    <Upload size={13} />
                    <span>{t('toolbar.pushDefault')}</span>
                  </button>

                  <button
                    type="button"
                    className="menu-action-item"
                    onClick={() => {
                      setPushMenu(null);
                      void runOperation('pushTag', [], '--tags');
                    }}
                    disabled={!!operation}
                    title={t('toolbar.pushAllTagsTitle')}
                  >
                    <Tag size={13} />
                    <span>{t('toolbar.pushAllTags')}</span>
                  </button>

                  <button
                    type="button"
                    className="menu-action-item menu-action-danger"
                    onClick={() => {
                      setPushMenu(null);
                      void runOperation('forcePushWithLease');
                    }}
                    disabled={!!operation}
                    title={t('toolbar.forcePushWithLeaseTitle')}
                  >
                    <ShieldAlert size={14} />
                    <div className="menu-action-text-col">
                      <span>{t('toolbar.forcePushWithLease')}</span>
                      <small>{t('toolbar.forcePushDesc')}</small>
                    </div>
                  </button>
                </div>,
                document.body
              )}
          </header>

          <InProgressBanner />

          <PanelGroup
            key={expandedDiff ? 'expanded' : 'normal'}
            direction="horizontal"
            autoSaveId={expandedDiff ? undefined : LAYOUT_KEY}
            onLayout={(layout) => {
              if (!expandedDiff) {
                localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
              }
            }}
            className="workspace"
          >
            {!expandedDiff && (
              <>
                <Panel defaultSize={savedLayout()?.[0] ?? 45} minSize={20}>
                  <GraphPanel />
                </Panel>
                <PanelResizeHandle className="resize-handle" />
              </>
            )}
            <Panel
              defaultSize={expandedDiff ? 20 : savedLayout()?.[1] ?? 20}
              minSize={12}
              maxSize={expandedDiff ? 35 : undefined}
            >
              <aside className="files-column">
                <FilesPanel />
                <CommitForm />
              </aside>
            </Panel>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={expandedDiff ? 80 : savedLayout()?.[2] ?? 35} minSize={26}>
              <DiffPanel />
            </Panel>
          </PanelGroup>
        </>
      )}

      {/* Footer Fixo com status, upstream e botões */}
      <footer className="app-footer">
        <div className="footer-left">
          <span>
            {operation
              ? t(`operations.${operation}`)
              : refreshing
              ? t('app.updating')
              : t('app.ready')}
          </span>
        </div>

        <div className="footer-right">
          <span>
            {session && snapshot?.upstream
              ? t('app.tracking', { upstream: snapshot.upstream })
              : session
              ? t('app.noUpstream')
              : tabs.length > 0
              ? t('app.tabsOpen', { count: tabs.length })
              : t('app.home')}
          </span>

          <button
            type="button"
            className="footer-help-btn"
            onClick={toggleSettings}
            title={`${t('settings.title')} (Ctrl+,)`}
            aria-label={t('settings.title')}
          >
            <Settings size={13} />
          </button>

          <button
            type="button"
            className="footer-help-btn"
            onClick={() => setShowShortcutsModal(true)}
            title={`${t('shortcuts.title')} (Ctrl+/ ou F1)`}
            aria-label={t('shortcuts.title')}
          >
            <HelpCircle size={13} />
          </button>
        </div>
      </footer>

      {/* Floating Toast Notification (bottom-left) */}
      {notice && (
        <div
          className={`notice-toast ${notice.category === 'success' ? 'notice-success' : 'notice-error'}`}
          role="status"
        >
          <div className="notice-header">
            <div className="notice-content">
              {notice.category === 'success' ? (
                <CheckCircle2 size={16} className="notice-icon-success" />
              ) : (
                <AlertCircle size={16} className="notice-icon-error" />
              )}
              <span className="notice-message">{notice.message}</span>
            </div>
            <button className="notice-close" onClick={dismissNotice} aria-label={t('app.closeNotice')}>
              <X size={14} />
            </button>
          </div>
          {'details' in notice && notice.details && (
            <details className="notice-expandable">
              <summary className="notice-summary">{t('app.details')}</summary>
              <pre className="notice-details">{notice.details}</pre>
            </details>
          )}
        </div>
      )}

      <NewBranchModal
        isOpen={showNewBranchModal}
        startPoint={snapshot?.branch ?? undefined}
        onClose={() => setShowNewBranchModal(false)}
        onSubmit={(params) => void runOperation('createBranch', [], JSON.stringify(params))}
      />

      {showShortcutsModal && (
        <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={closeSettings}
      />
    </main>
  );
}
