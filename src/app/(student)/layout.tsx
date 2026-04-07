import { Navbar } from "@/components/layout/navbar";
import { getSessionUser } from "@/lib/auth-helpers";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dbUser = await getSessionUser();

  return (
    <div className="min-h-screen flex flex-col bg-sand-50">
      <Navbar
        isAdmin={dbUser?.role === "ADMIN"}
        totalCredits={dbUser?.credits ?? 0}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
