import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('./monaco', () => ({
  monaco: {
    editor: {
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
    },
  },
}));

import {
  BUILTIN_THEMES,
  getAllThemes,
  getBuiltinThemes,
  getThemeById,
  getActiveThemeId,
  setActiveThemeId,
  saveOrUpdateCustomTheme,
  deleteCustomTheme,
  validateThemeJson,
  exportThemeJson,
  applyTheme,
} from './theme';
import type { ThemeDefinition } from './types';

describe('Theme Engine', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('provides built-in themes including dark, light, midnight, dracula, nord, monokai', () => {
    const builtin = getBuiltinThemes();
    expect(builtin.length).toBeGreaterThanOrEqual(6);
    expect(builtin.map((t) => t.id)).toContain('gitma-dark');
    expect(builtin.map((t) => t.id)).toContain('gitma-light');
    expect(builtin.map((t) => t.id)).toContain('dracula');
    expect(builtin.map((t) => t.id)).toContain('nord');

    const all = getAllThemes();
    expect(all.length).toBeGreaterThanOrEqual(6);
  });

  it('retrieves active theme ID falling back to gitma-dark', () => {
    expect(getActiveThemeId()).toBe('gitma-dark');
    setActiveThemeId('nord');
    expect(getActiveThemeId()).toBe('nord');
  });

  it('validates theme JSON string correctly', () => {
    const validTheme: ThemeDefinition = {
      id: 'custom-ocean',
      name: 'Custom Ocean',
      type: 'dark',
      colors: {
        bg: '#0a192f',
        surface: '#112240',
        raised: '#1d3557',
        border: '#233554',
        text: '#ccd6f6',
        muted: '#8892b0',
        accent: '#64ffda',
        green: '#51cf66',
        red: '#ff6b6b',
        selected: '#233554',
      },
    };

    const validResult = validateThemeJson(JSON.stringify(validTheme));
    expect(validResult.valid).toBe(true);
    expect(validResult.theme).toBeDefined();
    expect(validResult.theme?.name).toBe('Custom Ocean');

    const invalidResult = validateThemeJson(JSON.stringify({ name: 'Incomplete' }));
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toContain('colors');
  });

  it('saves and deletes custom themes in localStorage', () => {
    const custom: ThemeDefinition = {
      id: 'custom-solarized',
      name: 'Solarized Dark',
      type: 'dark',
      colors: { ...BUILTIN_THEMES[0].colors },
    };

    saveOrUpdateCustomTheme(custom);
    const themes = getAllThemes();
    expect(themes.some((t) => t.id === 'custom-solarized')).toBe(true);

    deleteCustomTheme('custom-solarized');
    const afterDelete = getAllThemes();
    expect(afterDelete.some((t) => t.id === 'custom-solarized')).toBe(false);
  });

  it('exports theme JSON correctly', () => {
    const sample = BUILTIN_THEMES[0];
    const exportedJson = exportThemeJson(sample);
    expect(typeof exportedJson).toBe('string');
    expect(exportedJson).toContain('gitma-dark');

    const validated = validateThemeJson(exportedJson);
    expect(validated.valid).toBe(true);
    expect(validated.theme?.id).toBe('gitma-dark');
  });

  it('applies theme variables to document documentElement', () => {
    const theme = BUILTIN_THEMES[0];
    applyTheme(theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme.id);
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe(theme.colors.bg);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(theme.colors.accent);
  });
});
