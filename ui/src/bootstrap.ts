import { getBridge } from './lib/bridge';
import { applyTheme, getActiveThemeId, getThemeById } from './lib/theme';
import { getLanguage, setLanguage } from './i18n';
import { useAppStore } from './store/app';

export function initializeAppearance() {
  try {
    applyTheme(getThemeById(getActiveThemeId()));
    setLanguage(getLanguage());
  } catch {}
}

export async function initializeApplication() {
  // Ensure saved theme and language are applied
  initializeAppearance();
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

  // Preload DiffPanel/Monaco chunk only AFTER initial workspace/tabs settle so cold start never competes with 2.4MB JS parse
  if (typeof window !== 'undefined') {
    const preload = () => { void import('./components/DiffPanel').catch(() => {}); };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(preload, { timeout: 2500 });
    } else {
      setTimeout(preload, 600);
    }
  }
}
