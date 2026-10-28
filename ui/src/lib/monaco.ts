import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/browser/coreCommands';
import 'monaco-editor/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget';
import 'monaco-editor/esm/vs/editor/browser/widget/diffEditor/diffEditor.contribution';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding';
import 'monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor';
import 'monaco-editor/esm/vs/editor/contrib/tokenization/browser/tokenization';
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations';
import 'monaco-editor/esm/vs/editor/contrib/diffEditorBreadcrumbs/browser/contribution';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codiconStyles';
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
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.languages.register({ id: 'json', extensions: ['.json', '.jsonc'] });
monaco.languages.setMonarchTokensProvider('json', {
  tokenizer: {
    root: [
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'type.identifier'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/\b(?:true|false|null)\b/, 'keyword'],
      [/[{}[\],:]/, 'delimiter'],
    ],
  },
});

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
