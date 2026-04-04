import { requireAdmin } from "@/lib/auth-helpers";
import { Navbar } from "@/components/layout/navbar";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen flex flex-col bg-sand-50">
      <Navbar />
      <AdminSidebar />
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
