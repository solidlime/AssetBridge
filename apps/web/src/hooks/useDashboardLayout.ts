"use client";
import { useState, useCallback } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

const STORAGE_KEY = "assetbridge-dashboard-layout";

// デフォルト順序（ブロックID）
const DEFAULT_ORDER = [
  "asset-history",
  "category-allocation",
  "monthly-expense",
  "credit-card",
  "balance-warning",
];

export function useDashboardLayout() {
  const [blockIds, setBlockIds] = useState<string[]>(() => {
    try {
      const saved =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        // 新しいブロックIDが追加された場合も対応
        const merged = [
          ...parsed.filter((id) => DEFAULT_ORDER.includes(id)),
        ];
        DEFAULT_ORDER.forEach((id) => {
          if (!merged.includes(id)) merged.push(id);
        });
        return merged;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_ORDER;
  });

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlockIds((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        const next = arrayMove(prev, oldIndex, newIndex);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    }
  }, []);

  return { blockIds, handleDragEnd };
}
