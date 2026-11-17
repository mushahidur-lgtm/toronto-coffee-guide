"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, Menu, X } from "lucide-react";
import { SITE } from "@/lib/site";
import { useFavourites } from "@/lib/favourites";

const NAV = [
  { href: "/cafes", label: "Explore Cafes" },
  { href: "/categories", label: "Categories" },
  { href: "/neighbourhoods", label: "Neighbourhoods" },
  { href: "/map", label: "Map" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { favourites } = useFavourites();

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/") || (href === "/categories" && pathname.startsWith("/toronto/"));

  const favLink = (
    <Link
      href="/favourites"
      aria-label={`Favourites${favourites.length ? ` (${favourites.length} saved)` : ""}`}
      aria-current={pathname === "/favourites" ? "page" : undefined}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-cream hover:text-ink"
    >
      <Heart size={18} strokeWidth={1.6} className={favourites.length ? "fill-clay text-clay" : ""} aria-hidden />
      {favourites.length > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-ink px-1 text-center text-[10px] font-semibold leading-4 text-paper tabular-nums">
          {favourites.length}
        </span>
      )}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:bg-paper focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">
          {SITE.name}
        </Link>
        <div className="flex items-center gap-2">
          <nav aria-label="Main" className="hidden md:block">
            <ul className="mr-3 flex items-center gap-7 text-sm">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={isActive(n.href) ? "page" : undefined}
                    className={isActive(n.href) ? "text-ink" : "text-muted transition-colors hover:text-ink"}
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {favLink}
          <button
            type="button"
            className="-mr-2 p-2 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-line md:hidden">
          <ul className="mx-auto max-w-7xl px-4 py-2">
            {[...NAV, { href: "/favourites", label: `Favourites${favourites.length ? ` (${favourites.length})` : ""}` }].map((n, i, all) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={`block py-3 text-base ${i < all.length - 1 ? "border-b border-line" : ""} ${isActive(n.href) ? "font-medium" : ""}`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
