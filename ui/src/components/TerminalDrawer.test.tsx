import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TerminalDrawer } from './TerminalDrawer';
import { useAppStore } from '../store/app';
import type { Session } from '../lib/types';

const mockSession: Session = {
  sessionId: 'test-session-1',
  name: 'test-repo',
  root: '/path/to/test-repo',
};

describe('TerminalDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      session: mockSession,
      isConsoleOpen: false,
      commandLogs: [],
      operation: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isConsoleOpen is false', () => {
    const { container } = render(<TerminalDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders terminal drawer with title and quick chips when open', () => {
    useAppStore.setState({ isConsoleOpen: true });
    render(<TerminalDrawer />);

    expect(screen.getByRole('region', { name: /Mini Terminal & Logs/i })).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('branch -a')).toBeInTheDocument();
    expect(screen.getByText('log -5')).toBeInTheDocument();
  });

  it('triggers runGitCommand when quick action chip is clicked', async () => {
    const runGitCommandSpy = vi.fn().mockResolvedValue('On branch main');
    useAppStore.setState({
      isConsoleOpen: true,
      runGitCommand: runGitCommandSpy,
    });

    render(<TerminalDrawer />);
    const statusChip = screen.getByText('status');
    fireEvent.click(statusChip);

    expect(runGitCommandSpy).toHaveBeenCalledWith('status');
  });

  it('submits command on Enter and clears input', async () => {
    const runGitCommandSpy = vi.fn().mockResolvedValue('');
    useAppStore.setState({
      isConsoleOpen: true,
      runGitCommand: runGitCommandSpy,
    });

    render(<TerminalDrawer />);
    const input = screen.getByPlaceholderText(/Digite um comando git/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'checkout -b feat/mini-terminal' } });
    expect(input.value).toBe('checkout -b feat/mini-terminal');

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(runGitCommandSpy).toHaveBeenCalledWith('checkout -b feat/mini-terminal');
    expect(input.value).toBe('');
  });

  it('displays logs and supports clearing them', () => {
    const clearLogsSpy = vi.fn();
    useAppStore.setState({
      isConsoleOpen: true,
      commandLogs: [
        {
          id: 'log-1',
          command: 'git status',
          output: 'On branch main\nnothing to commit',
          status: 'success',
          timestamp: Date.now(),
        },
      ],
      clearCommandLogs: clearLogsSpy,
    });

    render(<TerminalDrawer />);

    expect(screen.getByText('git status')).toBeInTheDocument();
    expect(screen.getByText(/nothing to commit/)).toBeInTheDocument();

    const clearBtn = screen.getByTitle(/Limpar histórico/i);
    fireEvent.click(clearBtn);

    expect(clearLogsSpy).toHaveBeenCalled();
  });

  it('navigates command history with ArrowUp and ArrowDown', () => {
    localStorage.setItem('Gitma:cli-history', JSON.stringify(['git status', 'git diff']));
    useAppStore.setState({ isConsoleOpen: true });

    render(<TerminalDrawer />);
    const input = screen.getByPlaceholderText(/Digite um comando git/i) as HTMLInputElement;

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('git diff');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('git status');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('git diff');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('');
  });

  it('closes the drawer when clicking the close button', () => {
    const setConsoleOpenSpy = vi.fn();
    useAppStore.setState({
      isConsoleOpen: true,
      setConsoleOpen: setConsoleOpenSpy,
    });

    render(<TerminalDrawer />);
    const closeBtn = screen.getByTitle(/Fechar painel/i);
    fireEvent.click(closeBtn);

    expect(setConsoleOpenSpy).toHaveBeenCalledWith(false);
  });
});
