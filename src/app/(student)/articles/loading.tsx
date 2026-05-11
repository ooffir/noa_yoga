/**
 * Loading skeleton for /articles (the magazine list).
 * Article CTA navigations are the most common entry to the magazine —
 * showing card-shaped placeholders communicates "list is coming" rather
 * than a generic spinner.
 */
export default function LoadingArticlesPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-10 text-center">
        <div className="mx-auto h-9 w-40 animate-pulse rounded-2xl bg-sage-100" />
        <div className="mx-auto mt-3 h-4 w-72 animate-pulse rounded-xl bg-sage-50" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-3xl border border-sage-100 bg-white shadow-sm"
          >
            <div className="aspect-video w-full animate-pulse bg-sage-50" />
            <div className="p-5">
              <div className="mb-3 h-6 w-3/4 animate-pulse rounded-xl bg-sage-100" />
              <div className="mb-2 h-4 w-full animate-pulse rounded-xl bg-sage-50" />
              <div className="h-4 w-5/6 animate-pulse rounded-xl bg-sage-50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
