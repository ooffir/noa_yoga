import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth-helpers";
import { AnalyticsView } from "@/components/admin/analytics-view";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-sage-900">ניתוח נתונים</h1>
        <p className="mt-1 text-sm text-sage-500">
          ביצועים של הסטודיו, דפוסי ביקוש, הכנסות ומעורבות תלמידות.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="rounded-3xl border border-sage-100 bg-white p-10 text-center text-sage-400">
            טוען ניתוח נתונים…
          </div>
        }
      >
        <AnalyticsView />
      </Suspense>
    </div>
  );
}
