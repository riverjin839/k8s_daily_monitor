import { useState, useEffect } from 'react';
import { arrayMove } from '@dnd-kit/sortable';

/**
 * Persists a drag-and-drop item order in localStorage.
 * - When `items` change (new items / deleted items), the stored order is merged.
 * - Returns `orderedItems` (the items in persisted order) and `handleDragEnd`.
 * - Call `clearOrder()` to reset to the default API order.
 */
export function useLocalOrder<T extends { id: string }>(
  items: T[],
  storageKey: string,
) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Keep orderedIds in sync when items change (new/deleted)
  useEffect(() => {
    setOrderedIds((prev) => {
      const existingIds = new Set(items.map((i) => i.id));
      // Remove stale ids
      const filtered = prev.filter((id) => existingIds.has(id));
      // Append new ids that aren't in the stored order
      const storedSet = new Set(filtered);
      const newIds = items.filter((i) => !storedSet.has(i.id)).map((i) => i.id);
      return [...filtered, ...newIds];
    });
  }, [items]);

  const orderedItems: T[] = (() => {
    const map = new Map(items.map((i) => [i.id, i]));
    const result: T[] = [];
    for (const id of orderedIds) {
      const item = map.get(id);
      if (item) result.push(item);
    }
    // Append any items not yet in orderedIds (safety net)
    const inOrder = new Set(orderedIds);
    for (const item of items) {
      if (!inOrder.has(item.id)) result.push(item);
    }
    return result;
  })();

  const handleDragEnd = (activeId: string, overId: string) => {
    if (activeId === overId) return;
    setOrderedIds((prev) => {
      const oldIndex = prev.indexOf(activeId);
      const newIndex = prev.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const clearOrder = () => {
    localStorage.removeItem(storageKey);
    setOrderedIds(items.map((i) => i.id));
  };

  return { orderedItems, handleDragEnd, clearOrder };
}
