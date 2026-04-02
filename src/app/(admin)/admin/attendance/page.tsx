import { AttendanceView } from "@/components/admin/attendance-view";

export const dynamic = "force-dynamic";

export default function AdminAttendancePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-sage-900 mb-6">נוכחות</h1>
      <AttendanceView />
    </div>
  );
}
