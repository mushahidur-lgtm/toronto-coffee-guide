import type { Metadata } from "next";
import Link from "next/link";
import { getCafeViews } from "@/lib/data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "About",
  description: "About the Toronto Coffee Guide: an independent directory of Toronto coffee shops and cafes.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const cafes = await getCafeViews();
  const hoods = new Set(cafes.map((c) => c.neighbourhood)).size;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <header className="pb-12 pt-14 sm:pt-20">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.02em] sm:text-6xl">A field guide to coffee in Toronto.</h1>
      </header>
      <div className="grid gap-12 border-t border-ink pt-10 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
        <dl className="grid grid-cols-2 gap-6 self-start">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Cafes</dt>
            <dd className="mt-1 text-4xl font-semibold tabular-nums">{cafes.length}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Neighbourhoods</dt>
            <dd className="mt-1 text-4xl font-semibold tabular-nums">{hoods}</dd>
          </div>
        </dl>
        <div className="max-w-2xl space-y-6 text-lg leading-relaxed text-ink-2">
          <p>
            The Toronto Coffee Guide is an independent directory of the city&rsquo;s coffee shops and cafes. It covers specialty
            roasters, neighbourhood espresso bars, Vietnamese cà phê, matcha bars, Japanese and Korean dessert cafes, bakeries and
            brunch spots, from Kensington Market to North York, Scarborough and Etobicoke.
          </p>
          <p>
            Search looks at what each cafe actually serves, not just its name. Type <em>matcha</em>, <em>croissant</em>,{" "}
            <em>egg coffee</em> or <em>bingsu</em> and you&rsquo;ll find cafes whose menus include them.
          </p>
          <h2 className="pt-4 text-xl font-semibold text-ink">How the information is gathered</h2>
          <p>
            Each listing starts with editorial research. Some entries come from our own knowledge of the city; others are cited from
            published Toronto food guides. We never invent hours, menus or addresses. When we don&rsquo;t know something, the listing
            says &ldquo;Not available&rdquo;.
          </p>
          <p>
            When Google Maps Platform is connected, each cafe is matched to its Google Place ID. Current addresses, opening hours,
            phone numbers and photos then come live from Google Maps, credited to the photographer, and cafes Google marks as
            permanently closed are hidden automatically.
          </p>
          <p>
            Missing a favourite, or spotted something out of date? Cafes are stored as structured data, so adding or correcting one
            doesn&rsquo;t need a redesign.{" "}
            <Link href="/cafes" className="link-quiet text-ink">
              Start exploring
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
