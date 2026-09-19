import { useEffect, useState } from 'react';
import {
  Check,
  Code,
  Copy,
  Download,
  Edit2,
  FileUp,
  GitBranch,
  Globe,
  Info,
  Palette,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import logoSvg from '../../logo.svg';
import type { SupportedLocale, ThemeColors, ThemeDefinition } from '../lib/types';
import {
  deleteCustomTheme,
  exportThemeJson,
  getActiveThemeId,
  getAllThemes,
  getThemeById,
  saveOrUpdateCustomTheme,
  setActiveThemeId,
  validateThemeJson,
} from '../lib/theme';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsSection = 'appearance' | 'language' | 'git' | 'about';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t, language, setLanguage, supportedLocales } = useI18n();

  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [themes, setThemes] = useState<ThemeDefinition[]>([]);
  const [currentThemeId, setCurrentThemeId] = useState<string>('gitma-dark');
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Theme Editor State
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | null>(null);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [editorJson, setEditorJson] = useState<string>('');
  const [editorError, setEditorError] = useState<string | null>(null);

  // Import Modal State
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Git Settings
  const [defaultBranch, setDefaultBranch] = useState('main');

  const refreshThemes = () => {
    setThemes(getAllThemes());
    setCurrentThemeId(getActiveThemeId());
  };

  useEffect(() => {
    if (isOpen) {
      refreshThemes();
      try {
        const saved = localStorage.getItem('Gitma:default-branch') || 'main';
        setDefaultBranch(saved);
      } catch {
        setDefaultBranch('main');
      }
      setFeedbackNotice(null);
      setEditingTheme(null);
      setShowImportDialog(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !editingTheme && !showImportDialog) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, editingTheme, showImportDialog, onClose]);

  const showToast = (msg: string) => {
    setFeedbackNotice(msg);
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  const handleSelectTheme = (id: string) => {
    setActiveThemeId(id);
    setCurrentThemeId(id);
  };

  const handleExportTheme = (theme: ThemeDefinition) => {
    const json = exportThemeJson(theme);
    void navigator.clipboard.writeText(json);
    showToast(t('settings.themeCopied'));
  };

  const handleDeleteTheme = (theme: ThemeDefinition) => {
    if (window.confirm(t('settings.deleteThemeConfirm', { name: theme.name }))) {
      deleteCustomTheme(theme.id);
      refreshThemes();
    }
  };

  const handleStartCreateTheme = () => {
    const active = getThemeById(currentThemeId);
    const newTheme: ThemeDefinition = {
      id: `theme-${Date.now()}`,
      name: `${active.name} (Cópia)`,
      author: 'Você',
      type: active.type,
      colors: { ...active.colors },
    };
    setEditingTheme(newTheme);
    setEditorJson(exportThemeJson(newTheme));
    setEditorMode('visual');
    setEditorError(null);
  };

  const handleStartEditTheme = (theme: ThemeDefinition) => {
    setEditingTheme({ ...theme, colors: { ...theme.colors } });
    setEditorJson(exportThemeJson(theme));
    setEditorMode('visual');
    setEditorError(null);
  };

  const handleSaveEditedTheme = () => {
    if (!editingTheme) return;

    if (editorMode === 'json') {
      const result = validateThemeJson(editorJson);
      if (!result.valid || !result.theme) {
        setEditorError(result.error || 'JSON inválido.');
        return;
      }
      saveOrUpdateCustomTheme(result.theme);
      setActiveThemeId(result.theme.id);
    } else {
      if (!editingTheme.name.trim()) {
        setEditorError('O nome do tema é obrigatório.');
        return;
      }
      saveOrUpdateCustomTheme(editingTheme);
      setActiveThemeId(editingTheme.id);
    }

    refreshThemes();
    setEditingTheme(null);
    showToast('Tema salvo com sucesso!');
  };

  const handleImportSubmit = () => {
    const result = validateThemeJson(importJsonText);
    if (!result.valid || !result.theme) {
      setImportError(result.error || 'JSON inválido.');
      return;
    }
    saveOrUpdateCustomTheme(result.theme);
    setActiveThemeId(result.theme.id);
    refreshThemes();
    setShowImportDialog(false);
    setImportJsonText('');
    setImportError(null);
    showToast(t('settings.themeImported'));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === 'string') {
        setImportJsonText(content);
        setImportError(null);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveDefaultBranch = (branch: string) => {
    const clean = branch.trim() || 'main';
    setDefaultBranch(clean);
    try {
      localStorage.setItem('Gitma:default-branch', clean);
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop settings-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="modal-card settings-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header settings-header">
          <div className="modal-title-group">
            <h3 id="settings-title">{t('settings.title')}</h3>
          </div>
          {feedbackNotice && <div className="settings-toast-inline">{feedbackNotice}</div>}
          <button
            type="button"
            className="icon-button modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>

        <div className="settings-content-layout">
          {/* Menu Lateral de Navegação das Configurações */}
          <nav className="settings-sidebar" aria-label="Seções de configurações">
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveSection('appearance')}
            >
              <Palette size={16} />
              <span>{t('settings.appearance')}</span>
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'language' ? 'active' : ''}`}
              onClick={() => setActiveSection('language')}
            >
              <Globe size={16} />
              <span>{t('settings.language')}</span>
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'git' ? 'active' : ''}`}
              onClick={() => setActiveSection('git')}
            >
              <GitBranch size={16} />
              <span>{t('settings.git')}</span>
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === 'about' ? 'active' : ''}`}
              onClick={() => setActiveSection('about')}
            >
              <Info size={16} />
              <span>{t('settings.about')}</span>
            </button>
          </nav>

          {/* Área Principal de Configuração */}
          <main className="settings-panel-body">
            {/* SEÇÃO: APARÊNCIA & TEMAS */}
            {activeSection === 'appearance' && (
              <div className="settings-section">
                <div className="section-title-row">
                  <div>
                    <h4 className="settings-section-title">{t('settings.appearance')}</h4>
                    <p className="settings-section-desc">{t('settings.appearanceDesc')}</p>
                  </div>
                  <div className="section-actions-row">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowImportDialog(true)}
                      title={t('settings.importTheme')}
                    >
                      <FileUp size={13} />
                      <span>{t('settings.importTheme')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleStartCreateTheme}
                      title={t('settings.newTheme')}
                    >
                      <Plus size={13} />
                      <span>{t('settings.newTheme')}</span>
                    </button>
                  </div>
                </div>

                {/* Lista / Grid de Temas */}
                <div className="theme-cards-grid">
                  {themes.map((th) => {
                    const isSelected = th.id === currentThemeId;
                    const isCustom = th.id.startsWith('theme-') || th.id.startsWith('custom-');

                    return (
                      <div
                        key={th.id}
                        className={`theme-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleSelectTheme(th.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleSelectTheme(th.id);
                          }
                        }}
                      >
                        <div className="theme-card-header">
                          <strong className="theme-name">{th.name}</strong>
                          {isSelected && <span className="theme-active-badge"><Check size={12} /></span>}
                        </div>

                        {th.author && <span className="theme-author">{th.author}</span>}

                        {/* Amostras de cores do tema */}
                        <div
                          className="theme-swatch-bar"
                          style={{ backgroundColor: th.colors.bg, borderColor: th.colors.border }}
                        >
                          <span
                            className="theme-dot"
                            style={{ backgroundColor: th.colors.surface }}
                            title="Surface"
                          />
                          <span
                            className="theme-dot"
                            style={{ backgroundColor: th.colors.accent }}
                            title="Accent"
                          />
                          <span
                            className="theme-dot"
                            style={{ backgroundColor: th.colors.green }}
                            title="Green"
                          />
                          <span
                            className="theme-dot"
                            style={{ backgroundColor: th.colors.red }}
                            title="Red"
                          />
                          <span
                            className="theme-dot"
                            style={{ backgroundColor: th.colors.text }}
                            title="Text"
                          />
                        </div>

                        {/* Ações do Cartão de Tema */}
                        <div className="theme-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="theme-action-btn"
                            onClick={() => handleExportTheme(th)}
                            title={t('settings.exportTheme')}
                          >
                            <Copy size={12} />
                          </button>

                          {isCustom && (
                            <>
                              <button
                                type="button"
                                className="theme-action-btn"
                                onClick={() => handleStartEditTheme(th)}
                                title={t('settings.editTheme')}
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                type="button"
                                className="theme-action-btn theme-action-danger"
                                onClick={() => handleDeleteTheme(th)}
                                title={t('settings.deleteTheme')}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEÇÃO: IDIOMA (i18n) */}
            {activeSection === 'language' && (
              <div className="settings-section">
                <h4 className="settings-section-title">{t('settings.language')}</h4>
                <p className="settings-section-desc">{t('settings.languageDesc')}</p>

                <div className="language-options-list">
                  {supportedLocales.map((loc) => {
                    const isSelected = loc.code === language;

                    return (
                      <div
                        key={loc.code}
                        className={`language-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => {
                          setLanguage(loc.code);
                          showToast(t('settings.languageChanged'));
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setLanguage(loc.code);
                          }
                        }}
                      >
                        <span className="lang-flag">{loc.flag}</span>
                        <div className="lang-info">
                          <strong className="lang-native-name">{loc.nativeName}</strong>
                          <span className="lang-code-desc">{loc.name} ({loc.code})</span>
                        </div>
                        {isSelected && <Check size={16} className="lang-check-icon" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEÇÃO: GIT & PREFERÊNCIAS */}
            {activeSection === 'git' && (
              <div className="settings-section">
                <h4 className="settings-section-title">{t('settings.git')}</h4>
                <p className="settings-section-desc">{t('settings.gitDesc')}</p>

                <div className="form-group settings-form-group">
                  <label htmlFor="settings-default-branch">
                    {t('settings.defaultBranch')}
                  </label>
                  <input
                    id="settings-default-branch"
                    type="text"
                    className="modal-input"
                    value={defaultBranch}
                    onChange={(e) => handleSaveDefaultBranch(e.target.value)}
                    placeholder="main"
                  />
                  <small className="form-help-text">
                    {t('settings.defaultBranchHelp')}
                  </small>
                </div>
              </div>
            )}

            {/* SEÇÃO: SOBRE */}
            {activeSection === 'about' && (
              <div className="settings-section about-section">
                <div className="about-hero">
                  <img src={logoSvg} alt="Gitma" className="about-hero-logo" />
                  <h3>Gitma Desktop</h3>
                  <span className="about-version">v0.1.1 • Tauri v2 + Rust</span>
                </div>

                <p className="about-desc">{t('settings.aboutText')}</p>

                <div className="about-meta-list">
                  <div className="about-meta-item">
                    <span>{t('settings.repository')}:</span>
                    <a
                      href="https://github.com/maicondallg/Gitma"
                      target="_blank"
                      rel="noreferrer"
                      className="about-link"
                    >
                      github.com/maicondallg/Gitma
                    </a>
                  </div>
                  <div className="about-meta-item">
                    <span>{t('settings.author')}:</span>
                    <strong>Maicon Dall'Agnol</strong>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* SUBMODAL: IMPORTAR TEMA JSON */}
        {showImportDialog && (
          <div className="modal-backdrop submodal-backdrop" onClick={() => setShowImportDialog(false)}>
            <div className="modal-card submodal-card" onClick={(e) => e.stopPropagation()}>
              <header className="modal-header">
                <div className="modal-title-group">
                  <FileUp size={16} />
                  <h4>{t('settings.importTheme')}</h4>
                </div>
                <button
                  type="button"
                  className="icon-button modal-close"
                  onClick={() => setShowImportDialog(false)}
                >
                  <X size={14} />
                </button>
              </header>

              <div className="modal-form">
                <div className="file-upload-row">
                  <label className="btn btn-secondary file-upload-btn">
                    <Download size={13} />
                    <span>Carregar arquivo .json</span>
                    <input type="file" accept=".json" onChange={handleFileUpload} />
                  </label>
                  <span className="file-upload-hint">ou cole o JSON abaixo:</span>
                </div>

                <textarea
                  className="modal-textarea json-textarea"
                  rows={10}
                  value={importJsonText}
                  onChange={(e) => {
                    setImportJsonText(e.target.value);
                    if (importError) setImportError(null);
                  }}
                  placeholder='{\n  "name": "Meu Tema",\n  "type": "dark",\n  "colors": {\n    "bg": "#111315", ...\n  }\n}'
                />

                {importError && <div className="form-error">{importError}</div>}

                <footer className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowImportDialog(false)}
                  >
                    {t('settings.themeEditorCancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!importJsonText.trim()}
                    onClick={handleImportSubmit}
                  >
                    Importar e Ativar
                  </button>
                </footer>
              </div>
            </div>
          </div>
        )}

        {/* SUBMODAL: EDITOR DE TEMA (VISUAL / JSON) */}
        {editingTheme && (
          <div className="modal-backdrop submodal-backdrop" onClick={() => setEditingTheme(null)}>
            <div className="modal-card submodal-card theme-editor-card" onClick={(e) => e.stopPropagation()}>
              <header className="modal-header">
                <div className="modal-title-group">
                  <Edit2 size={16} />
                  <h4>{t('settings.themeEditorTitle')}</h4>
                </div>
                <div className="editor-mode-toggle">
                  <button
                    type="button"
                    className={`btn btn-xs ${editorMode === 'visual' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setEditorMode('visual');
                      try {
                        const parsed = JSON.parse(editorJson);
                        setEditingTheme(parsed);
                      } catch {}
                    }}
                  >
                    Visual
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${editorMode === 'json' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setEditorMode('json');
                      setEditorJson(exportThemeJson(editingTheme));
                    }}
                  >
                    <Code size={12} />
                    <span>JSON</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="icon-button modal-close"
                  onClick={() => setEditingTheme(null)}
                >
                  <X size={14} />
                </button>
              </header>

              <div className="modal-form theme-editor-form">
                {editorMode === 'visual' ? (
                  <>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>{t('settings.themeName')}</label>
                        <input
                          type="text"
                          className="modal-input"
                          value={editingTheme.name}
                          onChange={(e) =>
                            setEditingTheme({ ...editingTheme, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('settings.themeType')}</label>
                        <select
                          className="modal-input modal-select"
                          value={editingTheme.type}
                          onChange={(e) =>
                            setEditingTheme({
                              ...editingTheme,
                              type: e.target.value as 'dark' | 'light',
                            })
                          }
                        >
                          <option value="dark">{t('settings.dark')}</option>
                          <option value="light">{t('settings.light')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="theme-color-fields-grid">
                      {(
                        [
                          ['bg', 'Fundo Geral'],
                          ['surface', 'Painéis e Superfícies'],
                          ['raised', 'Elementos Elevados'],
                          ['border', 'Bordas e Linhas'],
                          ['text', 'Texto Principal'],
                          ['muted', 'Texto Suave'],
                          ['accent', 'Cor de Destaque'],
                          ['green', 'Verde / Adições'],
                          ['red', 'Vermelho / Remoções'],
                          ['selected', 'Fundo de Seleção'],
                        ] as [keyof ThemeColors, string][]
                      ).map(([key, label]) => (
                        <div key={key} className="color-field-item">
                          <label>{label}</label>
                          <div className="color-input-wrapper">
                            <input
                              type="color"
                              className="color-picker-input"
                              value={editingTheme.colors[key] || '#000000'}
                              onChange={(e) =>
                                setEditingTheme({
                                  ...editingTheme,
                                  colors: { ...editingTheme.colors, [key]: e.target.value },
                                })
                              }
                            />
                            <input
                              type="text"
                              className="modal-input color-hex-input"
                              value={editingTheme.colors[key] || ''}
                              onChange={(e) =>
                                setEditingTheme({
                                  ...editingTheme,
                                  colors: { ...editingTheme.colors, [key]: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <textarea
                    className="modal-textarea json-textarea"
                    rows={14}
                    value={editorJson}
                    onChange={(e) => {
                      setEditorJson(e.target.value);
                      if (editorError) setEditorError(null);
                    }}
                  />
                )}

                {editorError && <div className="form-error">{editorError}</div>}

                <footer className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingTheme(null)}
                  >
                    {t('settings.themeEditorCancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveEditedTheme}
                  >
                    {t('settings.themeEditorSave')}
                  </button>
                </footer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
