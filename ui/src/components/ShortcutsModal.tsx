import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const shortcutGroups = [
    {
      title: 'Gerenciamento de Abas',
      shortcuts: [
        { desc: 'Nova aba / Abrir projeto(s)', keys: ['Ctrl', 'N'] },
        { desc: 'Fechar aba ativa', keys: ['Ctrl', 'W'] },
        { desc: 'Fechar aba pelo mouse', keys: ['Botão do meio'] },
        { desc: 'Fechar outras abas', keys: ['Ctrl', 'Shift', 'W'] },
        { desc: 'Próxima aba', keys: ['Ctrl', 'Tab'] },
        { desc: 'Aba anterior', keys: ['Ctrl', 'Shift', 'Tab'] },
        { desc: 'Pular para aba 1 a 8', keys: ['Ctrl', '1..8'] },
        { desc: 'Pular para última aba', keys: ['Ctrl', '9'] },
      ],
    },
    {
      title: 'Repositório & Histórico',
      shortcuts: [
        { desc: 'Abrir repositório local', keys: ['Ctrl', 'O'] },
        { desc: 'Criar nova branch', keys: ['Ctrl', 'B'] },
        { desc: 'Atualizar repositório', keys: ['Ctrl', 'R'] },
        { desc: 'Opções de Push (Force with lease)', keys: ['Botão direito', 'Push'] },
      ],
    },
    {
      title: 'Alterações & Commits',
      shortcuts: [
        { desc: 'Alternar stage do arquivo', keys: ['Espaço'] },
        { desc: 'Adicionar / remover do stage', keys: ['Duplo clique'] },
        { desc: 'Confirmar commit', keys: ['Ctrl', 'Enter'] },
        { desc: 'Emendar último commit', keys: ['Marcar Amend'] },
      ],
    },
    {
      title: 'Ajuda & Interface',
      shortcuts: [
        { desc: 'Ver atalhos de teclado', keys: ['Ctrl', '/'] },
        { desc: 'Fechar modais / menus', keys: ['Esc'] },
      ],
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Atalhos de teclado">
      <div className="modal-card shortcuts-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="shortcuts-modal-title">
            <Keyboard size={18} className="shortcuts-icon" />
            <strong>Atalhos de Teclado</strong>
          </div>
          <button
            type="button"
            className="icon-button modal-close"
            onClick={onClose}
            aria-label="Fechar janela de atalhos"
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
