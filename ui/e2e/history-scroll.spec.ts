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
  await expect.poll(() => page.locator('.lists-graph-row').count()).toBeLessThan(200);
  await viewport.evaluate((element) => { element.scrollTop = 7600; });
  await expect(page.locator('.lists-header-count').first()).toContainText('5000');
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(7000);
  await expect.poll(() => page.locator('.lists-graph-row').count()).toBeLessThan(200);
  await viewport.evaluate((element) => { element.scrollTop = 28 * 4000; });
  await expect(page.getByText('Scroll commit 4000', { exact: true })).toBeVisible();
});


test('fast scroll has text prepared ahead of the viewport in both directions', async ({ page }) => {
  await page.goto('/?fixture=local');
  await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = '/src/store/app.ts';
    const { useAppStore: store } = await import(modulePath);
    const history = store.getState().history;
    const template = history.rows[0];
    store.setState({ history: { ...history, hasMore: false, rows: Array.from({ length: 5000 }, (_, index) => ({
      ...template, row: index,
      commit: { ...template.commit, oid: `fast-${index}`, subject: `Fast commit ${index}`, refs: [] },
    })) } });
  });
  const viewport = page.getByRole('list', { name: 'Commits', exact: true });
  await viewport.evaluate((element) => { element.scrollTop = 28000; });
  await expect(page.getByText('Fast commit 1000', { exact: true })).toBeVisible();

  // Inspect the DOM *before* scrolling: the next screen must already have text.
  // A post-scroll visibility assertion alone misses transient blank frames.
  for (const direction of [1, 1, 1, -1, -1, -1]) {
    const delta = await viewport.evaluate((element, direction) => {
      const jump = Math.floor(element.clientHeight * 1.5) * direction;
      const target = element.scrollTop + jump;
      const first = Math.floor(target / 28);
      const last = Math.floor((target + element.clientHeight - 1) / 28);
      const rows = Array.from(element.querySelectorAll<HTMLButtonElement>('.lists-graph-row'));
      const missing = [];
      for (let index = first; index <= last; index++) {
        if (!rows.some((row) => row.querySelector('.lists-graph-subject')?.textContent === `Fast commit ${index - 1}`)) missing.push(index);
      }
      if (missing.length) throw new Error(`Unprepared rows before fast scroll: ${missing.join(', ')}`);
      return jump;
    }, direction);
    await viewport.hover();
    const before = await viewport.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, delta);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(before + delta);
    // Wait for the newly buffered range, not an arbitrary timeout.
    const edge = Math.floor((before + delta + (direction > 0 ? delta : 0)) / 28) - 1;
    await expect(page.getByText(`Fast commit ${edge}`, { exact: true })).toBeAttached();
  }
  await expect.poll(() => page.locator('.lists-graph-row').count()).toBeLessThan(200);
});
