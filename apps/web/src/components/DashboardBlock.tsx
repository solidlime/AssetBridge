"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";

interface DashboardBlockProps {
  id: string;
  children: React.ReactNode;
}

export function DashboardBlock({ id, children }: DashboardBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
      }}
    >
      {/* ドラッグハンドル */}
      <div
        {...attributes}
        {...listeners}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          cursor: "grab",
          color: "#475569",
          fontSize: 18,
          zIndex: 10,
          userSelect: "none",
          padding: "4px 8px",
          borderRadius: 4,
          background: "rgba(30,41,59,0.8)",
        }}
        title="ドラッグして移動"
      >
        ⠿
      </div>
      {children}
    </div>
  );
}
