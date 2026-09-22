import { createRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VirtualHistoryList, type HistoryListHandle } from './VirtualHistoryList';

const { virtualizer, position } = vi.hoisted(() => {
  const position = { last: 10 };
  return {
    position,
    virtualizer: {
      scrollToIndex: vi.fn(),
      getTotalSize: () => 2800,
      getVirtualItems: () => [position.last - 1, position.last].map((index) => ({ index, start: index * 28, key: index, size: 28, end: (index + 1) * 28, lane: 0 })),
    },
  };
});
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: () => virtualizer }));
afterEach(() => { cleanup(); vi.clearAllMocks(); position.last = 10; });

it('preserves scroll when a page is appended but reveals a new selection', () => {
  const props = { ref: createRef<HistoryListHandle>(), count: 100, rowHeight: 28, selectedIndex: 0, pageKey: 'page-0', hasMore: true, loadMore: vi.fn(async () => {}) };
  const row = () => null;
  const view = render(<VirtualHistoryList {...props}>{row}</VirtualHistoryList>);
  expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1);
  view.rerender(<VirtualHistoryList {...props} count={200} pageKey="page-1">{row}</VirtualHistoryList>);
  expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1);
  view.rerender(<VirtualHistoryList {...props} selectedIndex={80}>{row}</VirtualHistoryList>);
  expect(virtualizer.scrollToIndex).toHaveBeenLastCalledWith(80, { align: 'auto' });
});

it('prefetches near the end, suppresses pending duplicates and permits retry after scrolling', async () => {
  let complete!: () => void;
  const loadMore = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
  const props = { ref: createRef<HistoryListHandle>(), count: 100, rowHeight: 28, selectedIndex: -1, pageKey: 'page-0', hasMore: true, loadMore };
  const row = () => null;
  position.last = 80;
  const view = render(<VirtualHistoryList {...props}>{row}</VirtualHistoryList>);
  expect(loadMore).toHaveBeenCalledTimes(1);
  position.last = 81;
  view.rerender(<VirtualHistoryList {...props}>{row}</VirtualHistoryList>);
  expect(loadMore).toHaveBeenCalledTimes(1);
  await act(async () => complete());
  position.last = 82;
  view.rerender(<VirtualHistoryList {...props}>{row}</VirtualHistoryList>);
  expect(loadMore).toHaveBeenCalledTimes(2);
  await act(async () => complete());
});

it('only renders entering rows during scroll and updates content when the parent changes', () => {
  const props = { ref: createRef<HistoryListHandle>(), count: 100, rowHeight: 28, selectedIndex: -1, pageKey: 'page-0', hasMore: false, loadMore: vi.fn(async () => {}) };
  const row = vi.fn((item) => <span>{item.index}</span>);
  const view = render(<VirtualHistoryList {...props}>{row}</VirtualHistoryList>);
  expect(row).toHaveBeenCalledTimes(2);
  position.last++;
  view.rerender(<VirtualHistoryList {...props}>{row}</VirtualHistoryList>);
  expect(row).toHaveBeenCalledTimes(3);
  expect(view.queryByText('9')).toBeNull();
  const updatedRow = vi.fn((item) => <span>selected {item.index}</span>);
  view.rerender(<VirtualHistoryList {...props}>{updatedRow}</VirtualHistoryList>);
  expect(updatedRow).toHaveBeenCalledTimes(2);
  expect(view.getByText('selected 10')).toBeTruthy();
});
