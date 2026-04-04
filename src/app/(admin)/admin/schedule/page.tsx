import { Suspense } from "react";
import { ScheduleBuilder } from "@/components/admin/schedule-builder";
import { PageLoader } from "@/components/ui/loading";

export const dynamic = "force-dynamic";

export default function AdminSchedulePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-sage-900 mb-6">ניהול שיעורים</h1>
      <Suspense fallback={<PageLoader />}>
        <ScheduleBuilder />
      </Suspense>
    </div>
  );
}
