import { Suspense } from "react";
import { UsersManager } from "@/components/admin/users-manager";
import { PageLoader } from "@/components/ui/loading";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-sage-900 mb-6">ניהול תלמידות</h1>
      <Suspense fallback={<PageLoader />}>
        <UsersManager />
      </Suspense>
    </div>
  );
}
