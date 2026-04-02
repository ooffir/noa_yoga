export default function LoadingSchedulePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 pb-28">
      <div className="mb-7 animate-pulse">
        <div className="h-8 w-32 rounded-xl bg-sage-100" />
        <div className="mt-2 h-4 w-48 rounded-xl bg-sage-50" />
      </div>
      <div className="mb-7 flex items-center justify-between">
        <div className="h-10 w-24 animate-pulse rounded-2xl bg-sage-50" />
        <div className="h-4 w-20 animate-pulse rounded-xl bg-sage-50" />
        <div className="h-10 w-24 animate-pulse rounded-2xl bg-sage-50" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-3xl border border-sage-100 bg-white p-5 shadow-sm"
          >
            <div className="animate-pulse">
              <div className="mb-3 h-5 w-40 rounded-xl bg-sage-100" />
              <div className="mb-2 h-4 w-56 rounded-xl bg-sage-50" />
              <div className="h-4 w-44 rounded-xl bg-sage-50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
