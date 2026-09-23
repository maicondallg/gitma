import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/edcore.main';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution';
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

self.MonacoEnvironment = { getWorker: (_moduleId, label) => label === 'json' ? new JsonWorker() : new EditorWorker() };

monaco.editor.defineTheme('Gitma-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#111315',
    'editorGutter.background': '#111315',
    'editor.lineHighlightBackground': '#171a1d',
    // Linhas de inserção e remoção com tom suave e confortável aos olhos (sem efeito neon)
    'diffEditor.insertedLineBackground': '#2ea04318',
    'diffEditor.removedLineBackground': '#f8514918',
    // Destaque suave das palavras/caracteres modificados
    'diffEditor.insertedTextBackground': '#2ea04338',
    'diffEditor.removedTextBackground': '#f8514938',
    // Bordas transparentes para evitar caixas neon demarcando cada caractere
    'diffEditor.insertedTextBorder': '#00000000',
    'diffEditor.removedTextBorder': '#00000000',
    // Gutter das linhas alteradas suave
    'diffEditorGutter.insertedLineBackground': '#2ea04328',
    'diffEditorGutter.removedLineBackground': '#f8514928',
    // Marcadores no ruler e fundo diagonal
    'diffEditorOverview.insertedForeground': '#2ea04377',
    'diffEditorOverview.removedForeground': '#f8514977',
    'diffEditor.diagonalFill': '#1c2024',
    // Scrollbars
    'scrollbarSlider.background': '#3b424a',
    'scrollbarSlider.hoverBackground': '#4b5563',
    'scrollbarSlider.activeBackground': '#5865f2',
    'scrollbar.shadow': '#00000000',
  },
});
export { monaco };

export function languageForPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', css: 'css', html: 'html', md: 'markdown', rs: 'rust', py: 'python', go: 'go', java: 'java', yml: 'yaml', yaml: 'yaml', sh: 'shell', zsh: 'shell', sql: 'sql', xml: 'xml' } as Record<string, string>)[extension] ?? 'plaintext';
}
