export default function LoadingAdminPage() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 animate-pulse rounded-xl bg-sage-100" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-3xl border border-sage-100 bg-white"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-3xl border border-sage-100 bg-white" />
    </div>
  );
}
