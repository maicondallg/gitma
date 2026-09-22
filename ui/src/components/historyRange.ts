import type { Range } from '@tanstack/react-virtual';

const BLOCK_SIZE = 16;

// Native scrolling can move ahead of React's scroll handler. Keep two screens
// ready in either direction, including when the user reverses a fast scroll.
// Rounded blocks avoid mounting/unmounting a row for every 28px of movement.
export function createHistoryRangeExtractor() {
  let previousStart = -1;
  let previousEnd = -1;
  let indexes: number[] = [];
  return ({ startIndex, endIndex, count }: Range): number[] => {
    const screenRows = Math.ceil((endIndex - startIndex + 1) / BLOCK_SIZE) * BLOCK_SIZE;
    const padding = screenRows * 2;
    const start = Math.max(0, Math.floor((startIndex - padding) / BLOCK_SIZE) * BLOCK_SIZE);
    const end = Math.min(count, Math.ceil((endIndex + padding + 1) / BLOCK_SIZE) * BLOCK_SIZE);
    if (start !== previousStart || end !== previousEnd) {
      indexes = Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
      previousStart = start;
      previousEnd = end;
    }
    return indexes;
  };
}
