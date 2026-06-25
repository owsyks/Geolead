"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualListProps<T> {
  items: T[];
  /** Stable key for an item (defaults to index). */
  getKey?: (item: T, index: number) => string | number;
  /** Rough starting row height in px (measured for real after first paint). */
  estimateSize: number;
  /** Render one row's inner content. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Tailwind max-height for the scroll viewport (e.g. "max-h-72"). */
  maxHeightClass?: string;
  /** Vertical gap between rows in px. */
  gap?: number;
  /** Extra rows rendered above/below the viewport. */
  overscan?: number;
  className?: string;
}

/**
 * Windowed list: only the rows in (or near) the viewport are mounted, so a list
 * of thousands of items renders a handful of DOM nodes. Heights are measured per
 * row (`measureElement`), so variable-height items (leads, replies) lay out
 * correctly without a fixed row size.
 */
export function VirtualList<T>({
  items,
  getKey,
  estimateSize,
  renderItem,
  maxHeightClass = "max-h-72",
  gap = 8,
  overscan = 8,
  className = "",
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
  });

  return (
    <div ref={parentRef} className={`overflow-y-auto ${maxHeightClass} ${className}`}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index];
          return (
            <div
              key={getKey ? getKey(item, vi.index) : vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
                paddingBottom: gap,
              }}
            >
              {renderItem(item, vi.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
