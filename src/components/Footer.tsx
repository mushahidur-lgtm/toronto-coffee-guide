import Link from "next/link";
import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 text-sm sm:px-6 md:grid-cols-[2fr_1fr_1fr] lg:px-10">
        <div>
          <p className="font-semibold">{SITE.name}</p>
          <p className="mt-2 max-w-sm text-muted">
            An independent, curated directory of coffee shops and cafes across Toronto, Ontario.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="space-y-2 text-muted">
            <li><Link className="hover:text-ink" href="/cafes">Explore Cafes</Link></li>
            <li><Link className="hover:text-ink" href="/neighbourhoods">Neighbourhoods</Link></li>
            <li><Link className="hover:text-ink" href="/map">Map</Link></li>
            <li><Link className="hover:text-ink" href="/about">About</Link></li>
          </ul>
        </nav>
        <p className="text-muted md:text-right">
          Listings are editorial. Hours and photos, where shown, come from Google Maps and can change, so check before you go.
        </p>
      </div>
    </footer>
  );
}
