import { Navbar } from "@/components/layout/navbar";
import { getSessionUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

export async function NavbarServer() {
  const dbUser = await getSessionUser();

  // Sum direct credits + active punch-card credits so the navbar badge
  // matches what the booking engine actually lets the user spend.
  let totalCredits = 0;
  if (dbUser) {
    try {
      const punchCardAgg = await db.punchCard.aggregate({
        where: { userId: dbUser.id, status: "ACTIVE" },
        _sum: { remainingCredits: true },
      });
      totalCredits = (dbUser.credits ?? 0) + (punchCardAgg._sum.remainingCredits ?? 0);
    } catch {
      totalCredits = dbUser.credits ?? 0;
    }
  }

  return (
    <Navbar
      isAdmin={dbUser?.role === "ADMIN"}
      totalCredits={totalCredits}
    />
  );
}

export function NavbarSkeleton() {
  return (
    <header
      dir="rtl"
      className="sticky top-0 z-[100] w-full border-b border-sage-100 bg-[#FDFBF7]"
    >
      <div className="flex h-[50px] items-center px-4 md:mx-auto md:max-w-7xl md:px-8">
        <div className="h-5 w-24 animate-pulse rounded bg-sage-100" />
      </div>
    </header>
  );
}
