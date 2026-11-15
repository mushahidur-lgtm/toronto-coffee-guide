import type { Metadata } from "next";
import Link from "next/link";
import { getCafeViews } from "@/lib/data";
import { CafeExplorer } from "@/components/CafeExplorer";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Explore cafes",
  description: "Search Toronto coffee shops by name, neighbourhood, drink, food or cuisine: matcha, Vietnamese coffee, croissants, cold brew and more.",
  alternates: { canonical: "/cafes" },
};

export default async function CafesPage() {
  const cafes = await getCafeViews();
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-8 pt-14 sm:pt-20">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">Explore cafes</h1>
          <p className="mt-3 max-w-xl text-ink-2">
            Search by name, neighbourhood, drink, food or cuisine. Results update as you type.
          </p>
        </div>
        <Link href="/map" className="link-quiet text-sm">
          Map view
        </Link>
      </header>
      <CafeExplorer cafes={cafes} autoFocus />
    </div>
  );
}
