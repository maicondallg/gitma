import { getBridge } from './lib/bridge';
import { applyTheme, getActiveThemeId, getThemeById } from './lib/theme';
import { getLanguage, setLanguage } from './i18n';
import { useAppStore } from './store/app';

export async function initializeApplication() {
  // Apply saved theme and language as early as possible
  try {
    applyTheme(getThemeById(getActiveThemeId()));
    setLanguage(getLanguage());
  } catch {}
  // Preload DiffPanel/Monaco chunk in idle time so it is warm when needed
  if (typeof window !== 'undefined') {
    const preload = () => { void import('./components/DiffPanel').catch(() => {}); };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(preload, { timeout: 1500 });
    } else {
      setTimeout(preload, 200);
    }
  }
  const params = new URLSearchParams(window.location.search);
  let repo = params.get('repo');
  let fixture = params.get('fixture');
  if (!repo && !fixture) {
    const options = await getBridge().startupOptions?.().catch(() => null);
    repo = options?.repo ?? null;
    fixture = options?.fixture ?? null;
  }
  if (fixture) {
    const { installFixtureAdapter } = await import('./lib/fixtures');
    installFixtureAdapter(fixture);
    if (fixture === 'welcome') return;
    await useAppStore.getState().openRepository('/home/demo/projects/Gitma');
    if (fixture === 'history') await useAppStore.getState().selectCommit('a91cf08032a');
    const state = useAppStore.getState();
    const file = fixture === 'history' ? state.commitFiles[0] : state.snapshot?.unstaged[0];
    if (file) await state.selectFile(file);
    if (fixture === 'split') state.setDiffMode('split');
    if (fixture !== 'clean' && fixture !== 'history') state.setCommitMessage('Refine repository workspace\n\nPreserve selections during background updates.');
    if (fixture === 'error') useAppStore.setState({ notice: { category: 'diverged', message: 'Push rejeitado: o remoto contém commits novos.', details: 'Fetch and review remote history before pushing.' } });
  } else if (repo) {
    await useAppStore.getState().openRepository(repo);
  } else {
    await useAppStore.getState().restoreSavedTabs();
  }
}
