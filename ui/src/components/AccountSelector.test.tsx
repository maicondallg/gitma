import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSelector } from './AccountSelector';
import { useAppStore } from '../store/app';

afterEach(() => {
  cleanup();
});

describe('AccountSelector', () => {
  beforeEach(() => {
    useAppStore.setState({
      session: { sessionId: 'test-session', root: '/path/to/repo', name: 'repo' },
      operation: null,
      authState: {
        selectedId: 'auto',
        resolvedId: 'gh:maicondallg',
        resolvedLabel: 'maicondallg',
        resolutionReason: 'owner-match',
        accounts: [
          {
            id: 'gh:maicondallg',
            label: 'maicondallg',
            kind: 'github',
            username: 'maicondallg',
            sshKeyPath: '/home/user/.ssh/id_ed25519',
            sshKeyName: 'id_ed25519',
            isGhActive: false,
          },
          {
            id: 'gh:maicon-dallagnol-prestserv_petro',
            label: 'maicon-dallagnol-prestserv_petro',
            kind: 'github',
            username: 'maicon-dallagnol-prestserv_petro',
            sshKeyPath: '/home/user/.ssh/id_petro',
            sshKeyName: 'id_petro',
            isGhActive: true,
          },
        ],
      },
    });
  });

  it('renders resolved account and Auto badge in toolbar', () => {
    render(<AccountSelector />);
    const btn = screen.getByRole('button', { name: 'Selecionar conta Git/GitHub' });
    expect(btn.textContent).toContain('maicondallg');
    expect(btn.textContent).toContain('Auto');
  });

  it('opens dropdown menu and switches repository account', () => {
    const setRepoAccountSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ setRepoAccount: setRepoAccountSpy });

    render(<AccountSelector />);
    const btn = screen.getByRole('button', { name: 'Selecionar conta Git/GitHub' });
    fireEvent.click(btn);

    expect(screen.getByText('Automático (Recomendado)')).toBeDefined();
    const secondAccountBtn = screen.getByText('maicon-dallagnol-prestserv_petro');
    fireEvent.click(secondAccountBtn);

    expect(setRepoAccountSpy).toHaveBeenCalledWith('gh:maicon-dallagnol-prestserv_petro');
  });
});
