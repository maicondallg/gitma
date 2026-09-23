import { monaco } from './monaco';
import { registerEditorThemeApplier } from './theme';
import type { ThemeDefinition } from './types';

registerEditorThemeApplier((theme: ThemeDefinition) => {
  const colors = theme.colors;
  const isLight = theme.type === 'light';
  const name = `gitma-theme-${theme.id}`;

  monaco.editor.defineTheme(name, {
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
      'scrollbarSlider.background': isLight ? '#8c959f66' : '#3b424a',
      'scrollbarSlider.hoverBackground': isLight ? '#8c959f99' : '#4b5563',
      'scrollbarSlider.activeBackground': colors.accent,
      'scrollbar.shadow': '#00000000',
    },
  });
  monaco.editor.setTheme(name);
});
