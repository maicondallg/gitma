import { monaco } from './monaco';
import type { ThemeColors, ThemeDefinition } from './types';

export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: 'gitma-dark',
    name: 'Gitma Dark',
    author: 'Gitma Team',
    type: 'dark',
    colors: {
      bg: '#111315',
      surface: '#171a1d',
      raised: '#202429',
      border: '#30363d',
      text: '#e6e8eb',
      muted: '#929aa5',
      accent: '#72a7ff',
      green: '#61c482',
      red: '#ed7171',
      selected: '#26394d',
      tabBarBg: '#0d0f11',
      tabActiveBg: '#232830',
      tabActiveText: '#ffffff',
      monacoBase: 'vs-dark',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight AMOLED',
    author: 'Gitma Team',
    type: 'dark',
    colors: {
      bg: '#000000',
      surface: '#0a0a0c',
      raised: '#141418',
      border: '#24242a',
      text: '#f0f0f3',
      muted: '#80808c',
      accent: '#60a5fa',
      green: '#34d399',
      red: '#f87171',
      selected: '#1e293b',
      tabBarBg: '#000000',
      tabActiveBg: '#18181f',
      tabActiveText: '#ffffff',
      monacoBase: 'vs-dark',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    author: 'Zeno Rocha',
    type: 'dark',
    colors: {
      bg: '#282a36',
      surface: '#21222c',
      raised: '#343746',
      border: '#44475a',
      text: '#f8f8f2',
      muted: '#6272a4',
      accent: '#bd93f9',
      green: '#50fa7b',
      red: '#ff5555',
      selected: '#44475a',
      tabBarBg: '#191a21',
      tabActiveBg: '#282a36',
      tabActiveText: '#f8f8f2',
      monacoBase: 'vs-dark',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    author: 'Arctic Ice Studio',
    type: 'dark',
    colors: {
      bg: '#2e3440',
      surface: '#242933',
      raised: '#3b4252',
      border: '#434c5e',
      text: '#eceff4',
      muted: '#d8dee9',
      accent: '#88c0d0',
      green: '#a3be8c',
      red: '#bf616a',
      selected: '#4c566a',
      tabBarBg: '#20242c',
      tabActiveBg: '#2e3440',
      tabActiveText: '#88c0d0',
      monacoBase: 'vs-dark',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai Pro',
    author: 'Monokai',
    type: 'dark',
    colors: {
      bg: '#272822',
      surface: '#1e1f1c',
      raised: '#383830',
      border: '#49483e',
      text: '#f8f8f2',
      muted: '#75715e',
      accent: '#e6db74',
      green: '#a6e22e',
      red: '#f92672',
      selected: '#49483e',
      tabBarBg: '#181915',
      tabActiveBg: '#272822',
      tabActiveText: '#e6db74',
      monacoBase: 'vs-dark',
    },
  },
  {
    id: 'gitma-light',
    name: 'Gitma Light (GitHub)',
    author: 'Gitma Team',
    type: 'light',
    colors: {
      bg: '#ffffff',
      surface: '#f6f8fa',
      raised: '#eaeef2',
      border: '#d0d7de',
      text: '#1f2328',
      muted: '#656d76',
      accent: '#0969da',
      green: '#1a7f37',
      red: '#cf222e',
      selected: '#ddf4ff',
      tabBarBg: '#eaeef2',
      tabActiveBg: '#ffffff',
      tabActiveText: '#1f2328',
      monacoBase: 'vs',
    },
  },
];

const ACTIVE_THEME_KEY = 'Gitma:active-theme-id';
const CUSTOM_THEMES_KEY = 'Gitma:custom-themes';

export function getBuiltinThemes(): ThemeDefinition[] {
  return BUILTIN_THEMES;
}

export function loadCustomThemes(): ThemeDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes: ThemeDefinition[]): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  } catch {}
}

export function getAllThemes(): ThemeDefinition[] {
  const custom = loadCustomThemes();
  return [...BUILTIN_THEMES, ...custom];
}

export function getThemeById(id: string): ThemeDefinition {
  const all = getAllThemes();
  return all.find((t) => t.id === id) ?? BUILTIN_THEMES[0];
}

export function getActiveThemeId(): string {
  try {
    const saved = localStorage.getItem(ACTIVE_THEME_KEY);
    if (saved && getAllThemes().some((t) => t.id === saved)) {
      return saved;
    }
    return BUILTIN_THEMES[0].id;
  } catch {
    return BUILTIN_THEMES[0].id;
  }
}

export function setActiveThemeId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_THEME_KEY, id);
    const theme = getThemeById(id);
    applyTheme(theme);
  } catch {}
}

export function applyTheme(theme: ThemeDefinition): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const colors = theme.colors;

  root.style.setProperty('--bg', colors.bg);
  root.style.setProperty('--surface', colors.surface);
  root.style.setProperty('--raised', colors.raised);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--text', colors.text);
  root.style.setProperty('--muted', colors.muted);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--green', colors.green);
  root.style.setProperty('--red', colors.red);
  root.style.setProperty('--selected', colors.selected);

  if (colors.tabBarBg) {
    root.style.setProperty('--tab-bar-bg', colors.tabBarBg);
  } else {
    root.style.setProperty('--tab-bar-bg', colors.surface);
  }

  if (colors.tabActiveBg) {
    root.style.setProperty('--tab-item-active-bg', colors.tabActiveBg);
  } else {
    root.style.setProperty('--tab-item-active-bg', colors.raised);
  }

  if (colors.tabActiveText) {
    root.style.setProperty('--tab-item-active-text', colors.tabActiveText);
  } else {
    root.style.setProperty('--tab-item-active-text', colors.text);
  }

  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-theme-type', theme.type);

  // Define and apply Monaco Editor theme
  try {
    const isLight = theme.type === 'light';
    const monacoThemeName = `gitma-theme-${theme.id}`;

    monaco.editor.defineTheme(monacoThemeName, {
      base: colors.monacoBase ?? (isLight ? 'vs' : 'vs-dark'),
      inherit: true,
      rules: [],
      colors: {
        'editor.background': colors.bg,
        'editorGutter.background': colors.bg,
        'editor.lineHighlightBackground': isLight ? '#f0f3f6' : colors.surface,
        'diffEditor.insertedLineBackground': isLight ? '#2ea04314' : '#2ea04318',
        'diffEditor.removedLineBackground': isLight ? '#cf222e14' : '#f8514918',
        'diffEditor.insertedTextBackground': isLight ? '#2ea04330' : '#2ea04338',
        'diffEditor.removedTextBackground': isLight ? '#cf222e30' : '#f8514938',
        'diffEditor.insertedTextBorder': '#00000000',
        'diffEditor.removedTextBorder': '#00000000',
        'diffEditorGutter.insertedLineBackground': isLight ? '#2ea04320' : '#2ea04328',
        'diffEditorGutter.removedLineBackground': isLight ? '#cf222e20' : '#f8514928',
        'diffEditorOverview.insertedForeground': isLight ? '#2ea04366' : '#2ea04377',
        'diffEditorOverview.removedForeground': isLight ? '#cf222e66' : '#f8514977',
        'diffEditor.diagonalFill': isLight ? '#e1e4e8' : '#1c2024',
        'scrollbarSlider.background': isLight ? '#8c959f40' : '#3b424a',
        'scrollbarSlider.hoverBackground': isLight ? '#8c959f60' : '#4b5563',
        'scrollbarSlider.activeBackground': colors.accent,
        'scrollbar.shadow': '#00000000',
      },
    });

    monaco.editor.setTheme(monacoThemeName);
  } catch {
    // Monaco might not be fully mounted yet in SSR or test contexts
  }
}

export function validateThemeJson(jsonStr: string): { valid: boolean; theme?: ThemeDefinition; error?: string } {
  try {
    const obj = JSON.parse(jsonStr);
    if (!obj || typeof obj !== 'object') {
      return { valid: false, error: 'O JSON fornecido não é um objeto válido.' };
    }

    if (!obj.name || typeof obj.name !== 'string') {
      return { valid: false, error: 'O tema deve possuir um "name" válido (string).' };
    }

    const type = obj.type === 'light' ? 'light' : 'dark';
    const id = (obj.id && typeof obj.id === 'string' ? obj.id : `custom-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-');

    if (!obj.colors || typeof obj.colors !== 'object') {
      return { valid: false, error: 'O tema deve possuir o objeto "colors" contendo os tokens de cor.' };
    }

    const requiredKeys: (keyof ThemeColors)[] = [
      'bg',
      'surface',
      'raised',
      'border',
      'text',
      'muted',
      'accent',
      'green',
      'red',
      'selected',
    ];

    for (const key of requiredKeys) {
      if (!obj.colors[key] || typeof obj.colors[key] !== 'string') {
        return { valid: false, error: `Cor obrigatória ausente ou inválida: colors.${key}` };
      }
    }

    const theme: ThemeDefinition = {
      id,
      name: obj.name.trim(),
      author: obj.author ? String(obj.author).trim() : undefined,
      type,
      colors: {
        bg: obj.colors.bg,
        surface: obj.colors.surface,
        raised: obj.colors.raised,
        border: obj.colors.border,
        text: obj.colors.text,
        muted: obj.colors.muted,
        accent: obj.colors.accent,
        green: obj.colors.green,
        red: obj.colors.red,
        selected: obj.colors.selected,
        tabBarBg: obj.colors.tabBarBg,
        tabActiveBg: obj.colors.tabActiveBg,
        tabActiveText: obj.colors.tabActiveText,
        monacoBase: obj.colors.monacoBase ?? (type === 'light' ? 'vs' : 'vs-dark'),
      },
    };

    return { valid: true, theme };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Erro de sintaxe JSON: ${msg}` };
  }
}

export function exportThemeJson(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2);
}

export function saveOrUpdateCustomTheme(theme: ThemeDefinition): void {
  const current = loadCustomThemes();
  const existingIdx = current.findIndex((t) => t.id === theme.id);
  if (existingIdx >= 0) {
    current[existingIdx] = theme;
  } else {
    current.push(theme);
  }
  saveCustomThemes(current);
}

export function deleteCustomTheme(id: string): void {
  const current = loadCustomThemes().filter((t) => t.id !== id);
  saveCustomThemes(current);
  if (getActiveThemeId() === id) {
    setActiveThemeId(BUILTIN_THEMES[0].id);
  }
}
