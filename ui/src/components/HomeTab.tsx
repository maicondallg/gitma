import { useState } from 'react';
import {
  CheckSquare,
  Clock,
  Download,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  History,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { RecentRepo } from '../lib/types';
import { useAppStore } from '../store/app';
import logoSvg from '../../logo.svg';
import { CloneModal } from './CloneModal';
import { InitModal } from './InitModal';

function formatRelativeTime(
  timestamp: number,
  t: (key: string, params?: Record<string, any>) => string,
  lang: string
): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return t('timeAgo.now');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t('timeAgo.minutes', { count: diffMin });
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return t('timeAgo.hours', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return t('timeAgo.yesterday');
  if (diffDays < 7) return t(diffDays > 1 ? 'timeAgo.daysPlural' : 'timeAgo.days', { count: diffDays });
  return new Date(timestamp).toLocaleDateString(lang, { day: '2-digit', month: 'short' });
}

export function HomeTab() {
  const { t, language } = useI18n();

  const tabs = useAppStore((s) => s.tabs);
  const recentRepos = useAppStore((s) => s.recentRepos);
  const openRepository = useAppStore((s) => s.openRepository);
  const openRepositories = useAppStore((s) => s.openRepositories);
  const openSettings = useAppStore((s) => s.openSettings);
  const removeRecentRepo = useAppStore((s) => s.removeRecentRepo);
  const clearRecentRepos = useAppStore((s) => s.clearRecentRepos);
  const opening = useAppStore((s) => s.opening);
  const operation = useAppStore((s) => s.operation);

  const [filter, setFilter] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showInitModal, setShowInitModal] = useState(false);

  const filteredRecents = recentRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(filter.toLowerCase()) ||
      repo.path.toLowerCase().includes(filter.toLowerCase())
  );

  const toggleSelectPath = (path: string) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const toggleSelectAll = () => {
    if (selectedPaths.length === filteredRecents.length) {
      setSelectedPaths([]);
    } else {
      setSelectedPaths(filteredRecents.map((r) => r.path));
    }
  };

  const handleOpenSelected = async () => {
    if (selectedPaths.length === 0) return;
    await openRepositories(selectedPaths);
    setSelectMode(false);
    setSelectedPaths([]);
  };

  const handleRemoveSelected = () => {
    if (selectedPaths.length === 0) return;
    for (const p of selectedPaths) {
      removeRecentRepo(p);
    }
    setSelectedPaths([]);
  };

  return (
    <div className="home-tab-container">
      {/* Hero Header */}
      <header className="home-hero">
        <img src={logoSvg} alt="Gitma" className="home-hero-logo" />
        <h1 className="home-title">Gitma</h1>
        <p className="home-subtitle">{t('home.subtitle')}</p>
      </header>

      {/* Main Grid */}
      <div className="home-grid">
        {/* Coluna Esquerda: Ações Rápidas & Atalhos */}
        <section className="home-column home-column-actions">
          {/* Card: Ações Rápidas */}
          <div className="home-card action-card">
            <h2 className="home-section-title">
              <FolderOpen size={16} />
              <span>{t('home.quickActions')}</span>
            </h2>

            <div className="home-actions-list">
              <button
                type="button"
                className="home-primary-btn"
                onClick={() => void openRepositories()}
                disabled={opening || !!operation}
                title={t('home.openLocalRepoTitle')}
              >
                {opening ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    <div className="btn-text">
                      <strong>{t('home.opening')}</strong>
                      <span>{t('home.openingDesc')}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <FolderOpen size={18} />
                    <div className="btn-text">
                      <strong>{t('home.openLocalRepo')}</strong>
                      <span>{t('home.openLocalRepoDesc')}</span>
                    </div>
                    <kbd className="home-kbd">Ctrl+O</kbd>
                  </>
                )}
              </button>

              <button
                type="button"
                className="home-primary-btn home-secondary-action-btn"
                onClick={() => setShowCloneModal(true)}
                disabled={opening || !!operation}
                title={t('home.cloneRepoDesc')}
              >
                <Download size={18} />
                <div className="btn-text">
                  <strong>{t('home.cloneRepo')}</strong>
                  <span>{t('home.cloneRepoDesc')}</span>
                </div>
              </button>

              <button
                type="button"
                className="home-primary-btn home-secondary-action-btn"
                onClick={() => setShowInitModal(true)}
                disabled={opening || !!operation}
                title={t('home.initRepoDesc')}
              >
                <FolderPlus size={18} />
                <div className="btn-text">
                  <strong>{t('home.initRepo')}</strong>
                  <span>{t('home.initRepoDesc')}</span>
                </div>
              </button>

              <button
                type="button"
                className="home-primary-btn home-secondary-action-btn"
                onClick={openSettings}
                title={t('home.settingsDesc')}
              >
                <SettingsIcon size={18} />
                <div className="btn-text">
                  <strong>{t('home.settings')}</strong>
                  <span>{t('home.settingsDesc')}</span>
                </div>
                <kbd className="home-kbd">Ctrl+,</kbd>
              </button>
            </div>
          </div>

          <div className="home-info-badge">
            <span>Gitma Desktop v0.1.1 • Rust + WebKit</span>
          </div>
        </section>

        {/* Coluna Direita: Repositórios Recentes */}
        <section className="home-column home-column-recents">
          <div className="home-card recents-card">
            <div className="recents-header">
              <div className="recents-title-group">
                <History size={16} />
                <h2 className="home-section-title">{t('home.recents')}</h2>
                {recentRepos.length > 0 && (
                  <span className="recents-count">{recentRepos.length}</span>
                )}
              </div>

              {recentRepos.length > 0 && (
                <div className="recents-header-actions">
                  <button
                    type="button"
                    className={`recents-select-toggle ${selectMode ? 'active' : ''}`}
                    onClick={() => {
                      setSelectMode(!selectMode);
                      setSelectedPaths([]);
                    }}
                    title={t('home.selectMultiple')}
                  >
                    <CheckSquare size={13} />
                    <span>{selectMode ? t('home.cancel') : t('home.select')}</span>
                  </button>

                  <button
                    type="button"
                    className="recents-clear-btn"
                    onClick={() => {
                      if (window.confirm(t('home.clearConfirm'))) {
                        clearRecentRepos();
                      }
                    }}
                    title={t('home.clearHistory')}
                  >
                    <Trash2 size={13} />
                    <span>{t('home.clear')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Barra de Ações Múltiplas */}
            {selectMode && (
              <div className="recents-multi-bar">
                <button
                  type="button"
                  className="recents-multi-select-all"
                  onClick={toggleSelectAll}
                >
                  {selectedPaths.length === filteredRecents.length && filteredRecents.length > 0 ? (
                    <CheckSquare size={14} className="checkbox-icon-active" />
                  ) : (
                    <Square size={14} className="checkbox-icon" />
                  )}
                  <span>
                    {t('home.all')} ({selectedPaths.length}/{filteredRecents.length})
                  </span>
                </button>

                <div className="recents-multi-actions">
                  <button
                    type="button"
                    className="recents-open-selected-btn"
                    disabled={selectedPaths.length === 0}
                    onClick={() => void handleOpenSelected()}
                    title={t('home.openSelectedInTabs')}
                  >
                    <FolderPlus size={13} />
                    <span>{t('home.openSelected', { count: selectedPaths.length })}</span>
                  </button>

                  <button
                    type="button"
                    className="recents-remove-selected-btn"
                    disabled={selectedPaths.length === 0}
                    onClick={handleRemoveSelected}
                    title={t('home.removeSelectedFromRecents')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}

            {recentRepos.length > 3 && (
              <div className="recents-search">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder={t('home.filterPlaceholder')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="search-input"
                />
                {filter && (
                  <button
                    type="button"
                    onClick={() => setFilter('')}
                    className="search-clear"
                    title={t('home.clearFilter')}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {recentRepos.length === 0 ? (
              <div className="recents-empty">
                <Clock size={36} className="empty-icon" />
                <strong>{t('home.noRecents')}</strong>
                <p>{t('home.noRecentsDesc')}</p>
                <button
                  type="button"
                  className="open-button"
                  onClick={() => void openRepositories()}
                  disabled={opening || !!operation}
                >
                  <FolderOpen size={15} />
                  <span>{t('home.openLocalRepo')}</span>
                </button>
              </div>
            ) : filteredRecents.length === 0 ? (
              <div className="recents-empty-filter">
                <span>{t('home.notFoundFor', { query: filter })}</span>
              </div>
            ) : (
              <div className="recents-list">
                {filteredRecents.map((repo) => {
                  const isOpenInTab = tabs.some(
                    (t) => t.path === repo.path || t.session.root === repo.path
                  );
                  const isSelected = selectedPaths.includes(repo.path);

                  return (
                    <div
                      key={repo.path}
                      className={`recent-item ${isOpenInTab ? 'is-open' : ''} ${isSelected ? 'is-selected' : ''}`}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          setSelectMode(true);
                          toggleSelectPath(repo.path);
                          return;
                        }
                        if (selectMode) {
                          toggleSelectPath(repo.path);
                        } else {
                          void openRepository(repo.path);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (selectMode) {
                            toggleSelectPath(repo.path);
                          } else {
                            void openRepository(repo.path);
                          }
                        }
                      }}
                      title={selectMode ? (isSelected ? t('home.unselect') : t('home.select')) : `${t('home.openLocalRepo')}: ${repo.path}`}
                    >
                      {selectMode && (
                        <div className="recent-item-checkbox">
                          {isSelected ? (
                            <CheckSquare size={15} className="checkbox-icon-active" />
                          ) : (
                            <Square size={15} className="checkbox-icon" />
                          )}
                        </div>
                      )}

                      <div className="recent-item-icon">
                        <FolderGit2 size={16} />
                      </div>

                      <div className="recent-item-details">
                        <div className="recent-item-top">
                          <strong className="recent-name">{repo.name}</strong>
                          {isOpenInTab && (
                            <span className="open-pill" title={t('home.alreadyOpenTitle')}>
                              {t('home.opened')}
                            </span>
                          )}
                          <span className="recent-time">
                            {formatRelativeTime(repo.lastOpened, t, language)}
                          </span>
                        </div>
                        <span className="recent-path" title={repo.path}>
                          {repo.path}
                        </span>
                      </div>

                      {!selectMode && (
                        <button
                          type="button"
                          className="recent-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentRepo(repo.path);
                          }}
                          title={t('home.removeRecent')}
                          aria-label={`${t('home.removeRecent')} ${repo.name}`}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <CloneModal isOpen={showCloneModal} onClose={() => setShowCloneModal(false)} />
      <InitModal isOpen={showInitModal} onClose={() => setShowInitModal(false)} />
    </div>
  );
}
