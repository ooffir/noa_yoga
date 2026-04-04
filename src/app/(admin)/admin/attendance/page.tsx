import { Suspense } from "react";
import { AttendanceView } from "@/components/admin/attendance-view";
import { PageLoader } from "@/components/ui/loading";

export const dynamic = "force-dynamic";

export default function AdminAttendancePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-sage-900 mb-6">נוכחות</h1>
      <Suspense fallback={<PageLoader />}>
        <AttendanceView />
      </Suspense>
    </div>
  );
}
