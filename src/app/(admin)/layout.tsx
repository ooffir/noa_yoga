import { requireAdmin } from "@/lib/auth-helpers";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen flex">
      <AdminSidebar />
      <main className="flex-1 p-6 md:p-8 bg-sand-50 overflow-auto">
        {children}
      </main>
    </div>
  );
}
