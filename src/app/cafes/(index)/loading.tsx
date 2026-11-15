export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading cafes…</span>
      <div className="pb-8 pt-14 sm:pt-20">
        <div className="h-12 w-72 animate-pulse bg-wash" />
        <div className="mt-4 h-5 w-96 max-w-full animate-pulse bg-wash" />
      </div>
      <div className="h-16 w-full animate-pulse bg-wash" />
      <ul className="mt-28 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <div className="aspect-[4/3] animate-pulse bg-wash" />
            <div className="mt-4 h-3 w-24 animate-pulse bg-wash" />
            <div className="mt-3 h-5 w-48 animate-pulse bg-wash" />
            <div className="mt-3 h-16 w-full animate-pulse bg-wash" />
          </li>
        ))}
      </ul>
    </div>
  );
}
