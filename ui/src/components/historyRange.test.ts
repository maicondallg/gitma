import { expect, it } from 'vitest';
import { createHistoryRangeExtractor } from './historyRange';

it('prepares two screens in both directions with bounded mounted rows', () => {
  const extract = createHistoryRangeExtractor();
  for (const screen of [15, 26, 48, 72]) {
    const rows = extract({ startIndex: 1000, endIndex: 999 + screen, count: 50000, overscan: 0 });
    expect(rows[0]).toBeLessThanOrEqual(1000 - screen * 2);
    expect(rows.at(-1)).toBeGreaterThanOrEqual(999 + screen * 3);
    expect(rows.length).toBeLessThanOrEqual(screen * 5 + 96);
  }
});

it('reuses the range within a block and clips it at either end of the history', () => {
  const extract = createHistoryRangeExtractor();
  const range = { startIndex: 1000, endIndex: 1026, count: 5000, overscan: 0 };
  expect(extract({ ...range, startIndex: 1001, endIndex: 1027 })).toBe(extract(range));
  const start = extract({ ...range, startIndex: 0, endIndex: 26 });
  expect(start[0]).toBe(0);
  const end = extract({ ...range, startIndex: 4980, endIndex: 4999 });
  expect(end.at(-1)).toBe(4999);
  expect(extract({ ...range, startIndex: 0, endIndex: 5, count: 6 })).toEqual([0, 1, 2, 3, 4, 5]);
});
