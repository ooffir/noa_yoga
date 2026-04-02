import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-sage-200 border-t-sage-600",
        className
      )}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-sage-500">Loading...</p>
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-sage-100 bg-white p-5 shadow-sm animate-pulse">
      <div className="h-4 w-2/3 bg-sage-100 rounded mb-3" />
      <div className="h-3 w-1/2 bg-sage-50 rounded mb-2" />
      <div className="h-3 w-1/3 bg-sage-50 rounded" />
    </div>
  );
}
