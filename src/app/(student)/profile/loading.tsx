/**
 * Loading skeleton for /profile.
 *
 * Mirrors the real /profile layout: credits balance card, upcoming
 * bookings list, history, profile details, email preferences. Each
 * placeholder is roughly the same dimensions so the page doesn't jump
 * once the real content swaps in.
 */
export default function LoadingProfilePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6 h-7 w-32 animate-pulse rounded-xl bg-sage-100" />

      <div className="space-y-6">
        {/* Credits card */}
        <div className="rounded-3xl border border-sage-100 bg-white p-6 shadow-sm">
          <div className="mb-4 h-6 w-28 animate-pulse rounded-xl bg-sage-100" />
          <div className="mb-3 h-12 w-32 animate-pulse rounded-xl bg-sage-100" />
          <div className="mb-5 h-4 w-40 animate-pulse rounded-xl bg-sage-50" />
          <div className="h-10 w-36 animate-pulse rounded-2xl bg-sage-100" />
        </div>

        {/* Upcoming bookings card */}
        <div className="rounded-3xl border border-sage-100 bg-white p-6 shadow-sm">
          <div className="mb-4 h-5 w-40 animate-pulse rounded-xl bg-sage-100" />
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl bg-sage-50"
              />
            ))}
          </div>
        </div>

        {/* History card */}
        <div className="rounded-3xl border border-sage-100 bg-white p-6 shadow-sm">
          <div className="mb-4 h-5 w-36 animate-pulse rounded-xl bg-sage-100" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-2xl bg-sage-50"
              />
            ))}
          </div>
        </div>

        {/* Profile details card */}
        <div className="rounded-3xl border border-sage-100 bg-white p-6 shadow-sm">
          <div className="mb-4 h-5 w-32 animate-pulse rounded-xl bg-sage-100" />
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded-xl bg-sage-50" />
            <div className="h-10 animate-pulse rounded-xl bg-sage-50" />
            <div className="h-10 animate-pulse rounded-xl bg-sage-50" />
          </div>
        </div>
      </div>
    </div>
  );
}
