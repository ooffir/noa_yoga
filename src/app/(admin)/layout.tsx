import { requireAdmin } from "@/lib/auth-helpers";
import { Navbar } from "@/components/layout/navbar";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

const TRACE = process.env.NODE_ENV === "development";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (TRACE) console.time("admin:layout.requireAdmin");
  const dbUser = await requireAdmin();
  if (TRACE) console.timeEnd("admin:layout.requireAdmin");

  return (
    <div className="min-h-screen flex flex-col bg-sand-50">
      <Navbar isAdmin totalCredits={dbUser.credits} />
      <AdminSidebar />
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
