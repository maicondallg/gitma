import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useI18n } from '../i18n';

interface ShortcutsModalProps {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const shortcutGroups = [
    {
      title: t('shortcuts.tabMgmt'),
      shortcuts: [
        { desc: t('shortcuts.newTab'), keys: ['Ctrl', 'N'] },
        { desc: t('shortcuts.closeTab'), keys: ['Ctrl', 'W'] },
        { desc: t('shortcuts.closeTabMouse'), keys: [t('shortcuts.middleClick')] },
        { desc: t('shortcuts.closeOtherTabs'), keys: ['Ctrl', 'Shift', 'W'] },
        { desc: t('shortcuts.nextTab'), keys: ['Ctrl', 'Tab'] },
        { desc: t('shortcuts.prevTab'), keys: ['Ctrl', 'Shift', 'Tab'] },
        { desc: t('shortcuts.jumpToTab'), keys: ['Ctrl', '1..8'] },
        { desc: t('shortcuts.jumpToLastTab'), keys: ['Ctrl', '9'] },
      ],
    },
    {
      title: t('shortcuts.repoAndHistory'),
      shortcuts: [
        { desc: t('shortcuts.openLocalRepo'), keys: ['Ctrl', 'O'] },
        { desc: t('shortcuts.createNewBranch'), keys: ['Ctrl', 'B'] },
        { desc: t('shortcuts.refreshRepo'), keys: ['Ctrl', 'R'] },
        { desc: t('shortcuts.pushOptions'), keys: [t('shortcuts.rightClick'), 'Push'] },
      ],
    },
    {
      title: t('shortcuts.changesAndCommit'),
      shortcuts: [
        { desc: t('shortcuts.toggleStage'), keys: [t('shortcuts.space')] },
        { desc: t('shortcuts.addRemoveStage'), keys: [t('shortcuts.doubleClick')] },
        { desc: t('shortcuts.confirmCommit'), keys: ['Ctrl', 'Enter'] },
        { desc: t('shortcuts.amendLastCommit'), keys: [t('shortcuts.markAmend')] },
      ],
    },
    {
      title: t('shortcuts.helpAndInterface'),
      shortcuts: [
        { desc: t('shortcuts.viewShortcuts'), keys: ['Ctrl', '/'] },
        { desc: t('shortcuts.settingsShortcut'), keys: ['Ctrl', ','] },
        { desc: t('shortcuts.closeModals'), keys: ['Esc'] },
      ],
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('shortcuts.title')}>
      <div className="modal-card shortcuts-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="shortcuts-modal-title">
            <Keyboard size={18} className="shortcuts-icon" />
            <strong>{t('shortcuts.title')}</strong>
          </div>
          <button
            type="button"
            className="icon-button modal-close"
            onClick={onClose}
            aria-label={t('shortcuts.close')}
          >
            <X size={16} />
          </button>
        </header>

        <div className="shortcuts-modal-body">
          {shortcutGroups.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h4 className="shortcuts-group-title">{group.title}</h4>
              <ul className="shortcuts-group-list">
                {group.shortcuts.map((item) => (
                  <li key={item.desc} className="shortcuts-group-item">
                    <span className="shortcuts-item-desc">{item.desc}</span>
                    <div className="shortcuts-item-keys">
                      {item.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
