/**
 * Loading skeleton for /pricing.
 *
 * Renders three pricing cards as placeholders matching the real layout
 * (single class / 5-pass / 10-pass), so the page doesn't visually jump
 * once the SiteSettings prices load.
 */
export default function LoadingPricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <div className="text-center mb-10">
        <div className="mx-auto h-7 w-28 animate-pulse rounded-xl bg-sage-100" />
        <div className="mx-auto mt-2 h-4 w-72 animate-pulse rounded-xl bg-sage-50" />
      </div>

      <div className="grid gap-5 md:grid-cols-3 md:gap-6 md:items-start">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-3xl border border-sage-100 bg-white shadow-sm"
          >
            <div className="p-6">
              <div className="mb-2 h-6 w-3/4 animate-pulse rounded-xl bg-sage-100" />
              <div className="mb-5 h-4 w-1/2 animate-pulse rounded-xl bg-sage-50" />
              <div className="mb-1 h-10 w-32 animate-pulse rounded-xl bg-sage-100" />
              <div className="mb-5 h-3 w-24 animate-pulse rounded-xl bg-sage-50" />
              <div className="space-y-3 mb-8">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-4 w-full animate-pulse rounded-xl bg-sage-50"
                  />
                ))}
              </div>
              <div className="h-10 w-full animate-pulse rounded-2xl bg-sage-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
