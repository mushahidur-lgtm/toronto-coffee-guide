"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Favourites for anonymous visitors, saved in localStorage (by cafe slug). No account needed.
 * Works across tabs (storage event) and components (custom event). Every storage access is guarded,
 * so private windows / blocked storage just mean favourites don't persist.
 */
const KEY = "tcg:favourites";
const EVENT = "tcg:favourites-change";
const EMPTY: string[] = [];

let cache: { raw: string | null; list: string[] } = { raw: null, list: EMPTY };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.list;
  }
  if (raw === cache.raw) return cache.list; // stable reference for useSyncExternalStore
  let list: string[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{1,120}$/.test(s)) : EMPTY;
  } catch {
    list = EMPTY;
  }
  cache = { raw, list };
  return list;
}

function write(list: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    cache = { raw: cache.raw, list }; // keep it for this page view at least
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, cb);
  };
}

export function useFavourites() {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((slug: string) => {
    const cur = read();
    write(cur.includes(slug) ? cur.filter((s) => s !== slug) : [slug, ...cur]);
  }, []);
  const remove = useCallback((slug: string) => write(read().filter((s) => s !== slug)), []);
  return { favourites: list, isFavourite: (slug: string) => list.includes(slug), toggle, remove };
}
