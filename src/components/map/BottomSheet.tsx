"use client";

import { useEffect, useRef, useState } from "react";

export type Snap = "peek" | "half" | "full";

interface Props {
  snap: Snap;
  onSnap: (s: Snap) => void;
  header: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Mobile bottom sheet over the map with three snap points. Drag the handle (or tap it to cycle), or use the
 * keyboard (↑/↓ on the handle). The list inside scrolls on its own.
 */
export function BottomSheet({ snap, onSnap, header, children }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ startY: number; startH: number; h: number } | null>(null);
  const [parentH, setParentH] = useState(0);

  useEffect(() => {
    const parent = sheet.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => setParentH(parent.clientHeight));
    ro.observe(parent);
    setParentH(parent.clientHeight);
    return () => ro.disconnect();
  }, []);

  const heights: Record<Snap, number> = {
    peek: 112,
    half: Math.round(parentH * 0.5),
    full: Math.round(parentH * 0.9),
  };
  const height = drag ? drag.h : heights[snap];

  const nearest = (h: number): Snap =>
    (Object.entries(heights) as [Snap, number][]).reduce((best, [k, v]) => (Math.abs(v - h) < Math.abs(heights[best] - h) ? k : best), "peek" as Snap);

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for some pointer types; dragging still works without it.
    }
    setDrag({ startY: e.clientY, startH: heights[snap], h: heights[snap] });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const h = Math.min(heights.full, Math.max(heights.peek, drag.startH + (drag.startY - e.clientY)));
    setDrag({ ...drag, h });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const moved = Math.abs(drag.h - drag.startH);
    if (moved < 6) onSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek"); // a tap cycles
    else onSnap(nearest(drag.h));
    setDrag(null);
  };

  return (
    <div
      ref={sheet}
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col border-t border-line bg-paper shadow-[0_-8px_24px_rgba(0,0,0,0.08)] ${
        drag ? "" : "transition-[height] duration-200 ease-out"
      }`}
      style={{ height }}
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label="Cafe list panel"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={snap === "peek" ? 0 : snap === "half" ? 1 : 2}
        aria-valuetext={snap === "peek" ? "Collapsed" : snap === "half" ? "Half open" : "Open"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") onSnap(snap === "peek" ? "half" : "full");
          if (e.key === "ArrowDown") onSnap(snap === "full" ? "half" : "peek");
        }}
        className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-2 active:cursor-grabbing"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
        {header}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}
