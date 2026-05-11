/**
 * Loading skeleton for /workshops.
 *
 * Renders the moment the user clicks any link to /workshops — gives
 * them instant visual feedback that the navigation registered, instead
 * of leaving them staring at the previous page until the workshop list
 * + payment confirmations finish fetching from the DB.
 */
export default function LoadingWorkshopsPage() {
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
            className="flex flex-col overflow-hidden rounded-3xl border border-sage-100 bg-white shadow-sm"
          >
            <div className="aspect-video w-full animate-pulse bg-sage-50" />
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-3 h-6 w-3/4 animate-pulse rounded-xl bg-sage-100" />
              <div className="mb-2 h-4 w-1/2 animate-pulse rounded-xl bg-sage-50" />
              <div className="mb-4 h-4 w-2/3 animate-pulse rounded-xl bg-sage-50" />
              <div className="mb-2 h-4 w-full animate-pulse rounded-xl bg-sage-50" />
              <div className="mb-2 h-4 w-5/6 animate-pulse rounded-xl bg-sage-50" />
              <div className="mb-4 h-4 w-4/6 animate-pulse rounded-xl bg-sage-50" />
              <div className="mt-auto flex items-center justify-between pt-3 border-t border-sage-50">
                <div className="h-7 w-16 animate-pulse rounded-xl bg-sage-100" />
                <div className="h-9 w-28 animate-pulse rounded-2xl bg-sage-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
