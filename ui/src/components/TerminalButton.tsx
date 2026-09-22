import { Terminal } from 'lucide-react';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';

export interface TerminalPreset {
  id: string;
  name: string;
}

export const TERMINAL_PRESETS: TerminalPreset[] = [
  { id: 'default', name: 'Auto' },
  { id: 'ghostty', name: 'Ghostty' },
  { id: 'alacritty', name: 'Alacritty' },
  { id: 'kitty', name: 'Kitty' },
  { id: 'gnome-terminal', name: 'GNOME Terminal' },
  { id: 'konsole', name: 'Konsole' },
  { id: 'wezterm', name: 'WezTerm' },
  { id: 'xfce4-terminal', name: 'Xfce Terminal' },
  { id: 'xterm', name: 'xterm' },
  { id: 'custom', name: 'Personalizado' },
];

export function getTerminalDisplayName(id: string, defaultLabel?: string, customLabel?: string): string {
  if (!id || id === 'default') return defaultLabel || 'Auto';
  const found = TERMINAL_PRESETS.find((p) => p.id === id);
  if (found && found.id !== 'custom') return found.name;
  return id === 'custom' ? (customLabel || 'Personalizado') : id;
}

export function TerminalButton() {
  const preferredTerminal = useAppStore((s) => s.preferredTerminal);
  const openTerminal = useAppStore((s) => s.openTerminal);
  const operation = useAppStore((s) => s.operation);
  const session = useAppStore((s) => s.session);
  const { t } = useI18n();

  if (!session) return null;

  const currentDisplayName = getTerminalDisplayName(
    preferredTerminal,
    t('terminal.defaultSystem'),
    t('terminal.custom')
  );
  const tooltip = `${t('terminal.openTerminal')} (${currentDisplayName})`;

  return (
    <button
      type="button"
      className="sync-button"
      onClick={() => void openTerminal()}
      disabled={!!operation}
      title={tooltip}
      aria-label={t('terminal.openTerminal')}
    >
      <Terminal size={14} />
      <span>{t('terminal.title')}</span>
    </button>
  );
}
