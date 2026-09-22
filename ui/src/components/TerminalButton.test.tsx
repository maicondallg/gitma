import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalButton } from './TerminalButton';
import { useAppStore } from '../store/app';

afterEach(() => {
  cleanup();
});

vi.mock('../i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => {
      if (key === 'terminal.title') return 'Terminal';
      if (key === 'terminal.openTerminal') return 'Abrir Terminal';
      if (key === 'terminal.defaultSystem') return 'Padrão do Sistema (Auto)';
      return key;
    },
  }),
}));

describe('TerminalButton', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      session: { sessionId: 'test-session', root: '/path/to/my-repo', name: 'my-repo' },
      preferredTerminal: 'default',
      operation: null,
    });
  });

  it('renders terminal button with label and icon', () => {
    render(<TerminalButton />);
    const btn = screen.getByRole('button', { name: 'Abrir Terminal' });
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain('Terminal');
    expect(btn.title).toContain('Abrir Terminal');
  });

  it('calls openTerminal when clicking button', async () => {
    const openTerminalSpy = vi.fn();
    useAppStore.setState({ openTerminal: openTerminalSpy });

    render(<TerminalButton />);
    const btn = screen.getByRole('button', { name: 'Abrir Terminal' });
    fireEvent.click(btn);

    expect(openTerminalSpy).toHaveBeenCalled();
  });

  it('includes configured terminal in tooltip title when ghostty is set', () => {
    useAppStore.setState({ preferredTerminal: 'ghostty' });

    render(<TerminalButton />);
    const btn = screen.getByRole('button', { name: 'Abrir Terminal' });
    expect(btn.title).toBe('Abrir Terminal (Ghostty)');
  });

  it('does not render when no session is active', () => {
    useAppStore.setState({ session: null });

    const { container } = render(<TerminalButton />);
    expect(container.firstChild).toBeNull();
  });
});
