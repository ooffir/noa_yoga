import { Suspense } from "react";
import { DashboardView } from "@/components/admin/dashboard-view";

export const dynamic = "force-dynamic";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-3xl border border-sage-100 bg-white" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-3xl border border-sage-100 bg-white" />
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-sage-900 mb-6">לוח בקרה</h1>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardView />
      </Suspense>
    </div>
  );
}
