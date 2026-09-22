import { expect, test } from '@playwright/test';

test('large history stays virtualized and preserves scroll while loading another page', async ({ page }) => {
  await page.goto('/?fixture=local');
  await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible();
  await page.evaluate(async () => {
    // Use the real store and virtualizer with a large deterministic history.
    const modulePath = '/src/store/app.ts';
    const { useAppStore: store } = await import(modulePath);
    const history = store.getState().history;
    const template = history.rows[0];
    const rows = Array.from({ length: 5000 }, (_, index) => ({
      ...template, row: index,
      commit: { ...template.commit, oid: `scroll-${index}`, subject: `Scroll commit ${index}`, refs: [] },
    }));
    store.setState({
      history: { ...history, rows: rows.slice(0, 300), hasMore: true },
      loadMore: async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        store.setState({ history: { ...history, page: 1, rows, hasMore: false } });
      },
    });
  });
  const viewport = page.getByRole('list', { name: 'Commits', exact: true });
  await expect.poll(() => page.locator('.lists-graph-row').count()).toBeLessThan(100);
  await viewport.evaluate((element) => { element.scrollTop = 7600; });
  await expect(page.locator('.lists-header-count').first()).toContainText('5000');
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(7000);
  await expect.poll(() => page.locator('.lists-graph-row').count()).toBeLessThan(100);
  await viewport.evaluate((element) => { element.scrollTop = 28 * 4000; });
  await expect(page.getByText('Scroll commit 4000', { exact: true })).toBeVisible();
});
