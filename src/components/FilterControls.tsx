"use client";

import { useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

/** Filter UI pieces shared by the /cafes explorer and the /map filter bar. */

export function FilterMenu({
  label,
  count,
  children,
  align = "left",
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  /** Open the panel towards the left when the button sits near the right edge. */
  align?: "left" | "right";
}) {
  return (
    <details data-popover className="relative">
      <summary
        className={`inline-flex cursor-pointer select-none items-center gap-1.5 border bg-paper px-3 py-2 hover:border-ink-2 ${count ? "border-ink" : "border-line"}`}
      >
        {label}
        {count > 0 && <span className="tabular-nums">({count})</span>}
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
      </summary>
      <div
        className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-1 max-h-[60vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto border border-line bg-paper p-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)]`}
      >
        {children}
      </div>
    </details>
  );
}

export function CheckList({
  options,
  selected,
  onToggle,
  name,
  columns,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  name: string;
  columns?: boolean;
}) {
  return (
    <ul className={columns ? "grid grid-cols-2 gap-x-4" : ""}>
      {options.map((o) => {
        const id = `${name}-${o.replace(/\W+/g, "-")}`;
        return (
          <li key={o}>
            <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
              <input id={id} type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)} className="h-4 w-4 accent-[#161616]" />
              {o === "Other" ? "Other neighbourhoods" : o}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 border border-line bg-wash py-1 pl-2.5 pr-1">
      {label}
      <button type="button" onClick={onRemove} className="p-0.5 text-muted hover:text-ink" aria-label={`Remove ${label}`}>
        <X size={14} strokeWidth={1.5} />
      </button>
    </span>
  );
}

/** Close open filter popovers (<details data-popover>) on an outside click or Escape. */
export function usePopoverDismiss() {
  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll<HTMLDetailsElement>("details[data-popover][open]").forEach((d) => {
        if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
      });
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
}
