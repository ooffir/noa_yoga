import { UsersManager } from "@/components/admin/users-manager";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-sage-900 mb-6">ניהול תלמידות</h1>
      <UsersManager />
    </div>
  );
}
