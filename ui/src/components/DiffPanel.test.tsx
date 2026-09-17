import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DiffPanel } from './DiffPanel';
import { useAppStore } from '../store/app';

vi.mock('../lib/monaco', () => ({
  monaco: {
    editor: {
      createDiffEditor: vi.fn(() => ({
        setModel: vi.fn(),
        updateOptions: vi.fn(),
        dispose: vi.fn(),
      })),
      createModel: vi.fn(() => ({
        dispose: vi.fn(),
      })),
      setTheme: vi.fn(),
    },
  },
  languageForPath: vi.fn(() => 'python'),
}));

describe('DiffPanel header e botões de ação', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      selectedFile: {
        id: 'f1',
        name: 'search_wells.py',
        directory: 'src/radiar/doc_classification/api/docs/wells',
        pathDisplay: 'src/radiar/doc_classification/api/docs/wells/search_wells.py',
        oldPathDisplay: null,
        status: 'modified',
        area: 'commit',
      },
      preview: null,
      diffMode: 'unified',
      compactDiff: false,
      expandedDiff: false,
    });
  });

  it('renderiza o path dentro de bdo dir="ltr" para truncamento à esquerda', () => {
    const { container } = render(<DiffPanel />);
    const pathLabel = container.querySelector('.path-label');
    expect(pathLabel).toBeInTheDocument();
    expect(pathLabel).toHaveAttribute('title', 'src/radiar/doc_classification/api/docs/wells/search_wells.py');

    const bdo = pathLabel?.querySelector('bdo');
    expect(bdo).toBeInTheDocument();
    expect(bdo).toHaveAttribute('dir', 'ltr');
    expect(bdo?.textContent).toBe('src/radiar/doc_classification/api/docs/wells/search_wells.py');
  });

  it('renderiza os botões "Só alterações", "Unificado" e "Lado a lado" com labels em linha única', () => {
    render(<DiffPanel />);

    const compactBtn = screen.getByRole('button', { name: /Só alterações/i });
    const unifiedBtn = screen.getByRole('button', { name: /Unificado/i });
    const splitBtn = screen.getByRole('button', { name: /Lado a lado/i });

    expect(compactBtn).toBeInTheDocument();
    expect(unifiedBtn).toBeInTheDocument();
    expect(splitBtn).toBeInTheDocument();

    // Alterna compactDiff ao clicar em "Só alterações"
    fireEvent.click(compactBtn);
    expect(useAppStore.getState().compactDiff).toBe(true);

    // Alterna diffMode ao clicar em "Lado a lado"
    fireEvent.click(splitBtn);
    expect(useAppStore.getState().diffMode).toBe('split');
  });
});
