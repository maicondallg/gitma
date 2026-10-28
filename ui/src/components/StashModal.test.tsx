import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StashModal } from './StashModal';

describe('StashModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <StashModal
        isOpen={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when open', () => {
    render(
      <StashModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Mensagem para o stash/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Incluir novos arquivos não monitorados/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar no Stash' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Cancelar/i })).toHaveLength(2);
  });

  it('submits with entered message and untracked option', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <StashModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    const messageInput = screen.getByLabelText(/Mensagem para o stash/i);
    fireEvent.change(messageInput, { target: { value: 'Minhas alterações WIP' } });

    const untrackedCheckbox = screen.getByLabelText(/Incluir novos arquivos não monitorados/i);
    fireEvent.click(untrackedCheckbox);

    const submitBtn = screen.getByRole('button', { name: 'Guardar no Stash' });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      message: 'Minhas alterações WIP',
      includeUntracked: true,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('submits with empty message when optional', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <StashModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    const submitBtn = screen.getByRole('button', { name: 'Guardar no Stash' });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      message: '',
      includeUntracked: false,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking Cancel button or backdrop or header close button', () => {
    const onClose = vi.fn();

    const { rerender } = render(
      <StashModal
        isOpen={true}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    const cancelButtons = screen.getAllByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelButtons[1]); // footer Cancel button
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <StashModal
        isOpen={true}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );
    const closeIconBtn = screen.getAllByRole('button', { name: /Cancelar/i })[0];
    fireEvent.click(closeIconBtn);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();

    render(
      <StashModal
        isOpen={true}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
