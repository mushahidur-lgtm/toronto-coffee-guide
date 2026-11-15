import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-32 text-center sm:px-6 lg:px-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">We couldn&rsquo;t find that page.</h1>
      <p className="mt-3 text-muted">The cafe may have moved or closed.</p>
      <Link href="/cafes" className="link-quiet mt-8 inline-block">
        Explore all cafes
      </Link>
    </div>
  );
}
