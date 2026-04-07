import { Suspense } from "react";
import { WorkshopsManager } from "@/components/admin/workshops-manager";
import { PageLoader } from "@/components/ui/loading";

export const dynamic = "force-dynamic";

export default function AdminWorkshopsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-sage-900 mb-6">ניהול סדנאות</h1>
      <Suspense fallback={<PageLoader />}>
        <WorkshopsManager />
      </Suspense>
    </div>
  );
}
