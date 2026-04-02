import { ScheduleBuilder } from "@/components/admin/schedule-builder";

export const dynamic = "force-dynamic";

export default function AdminSchedulePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-sage-900 mb-6">ניהול שיעורים</h1>
      <ScheduleBuilder />
    </div>
  );
}
