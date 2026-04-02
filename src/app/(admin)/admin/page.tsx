import { DashboardView } from "@/components/admin/dashboard-view";

export const dynamic = "force-dynamic";

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-sage-900 mb-6">לוח בקרה</h1>
      <DashboardView />
    </div>
  );
}
