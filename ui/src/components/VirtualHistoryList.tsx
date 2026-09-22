import { memo, useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';

export interface HistoryListHandle {
  scrollToIndex(index: number, options: { align: 'auto' }): void;
}

// Scroll changes the visible range, but rows that remain in it keep their
// content and position. Avoid rebuilding their refs, dates, icons and handlers.
const HistoryRow = memo(function HistoryRow({ item, render }: {
  item: VirtualItem;
  render: (item: VirtualItem) => ReactNode;
}) {
  return render(item);
}, (previous, next) => previous.render === next.render &&
  previous.item.key === next.item.key &&
  previous.item.index === next.item.index &&
  previous.item.start === next.item.start &&
  previous.item.end === next.item.end &&
  previous.item.size === next.item.size &&
  previous.item.lane === next.item.lane);

// Keep scroll updates inside the viewport so they do not render the whole panel,
// its menus, search controls and keyboard handlers on every scroll event.
export function VirtualHistoryList({
  ref, count, rowHeight, selectedIndex, pageKey, hasMore, loadMore, children,
}: {
  ref: Ref<HistoryListHandle>;
  count: number;
  rowHeight: number;
  selectedIndex: number;
  pageKey: string;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  children: (item: VirtualItem) => ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const requestedPage = useRef<string | null>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });
  useImperativeHandle(ref, () => ({
    scrollToIndex: (index, options) => virtualizer.scrollToIndex(index, options),
  }), [virtualizer]);

  // Appending a page must not scroll back to the currently selected commit.
  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;
  useEffect(() => {
    if (hasMore && count > 1 && lastIndex >= count - 24 && requestedPage.current !== pageKey) {
      requestedPage.current = pageKey;
      void loadMore().finally(() => {
        // Permit a retry on the next scroll if the request failed or was invalidated.
        if (requestedPage.current === pageKey) requestedPage.current = null;
      });
    }
  }, [hasMore, count, lastIndex, pageKey, loadMore]);

  return (
    <div ref={viewportRef} className="lists-scroll" tabIndex={0} role="list" aria-label="Commits">
      <div className="lists-virtual-content" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((item) => <HistoryRow key={item.key ?? item.index} item={item} render={children} />)}
      </div>
    </div>
  );
}
