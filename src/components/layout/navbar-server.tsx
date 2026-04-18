import { Navbar } from "@/components/layout/navbar";
import { getSessionUser } from "@/lib/auth-helpers";

const TRACE = process.env.NODE_ENV === "development";

export async function NavbarServer() {
  if (TRACE) console.time("layout:navbar.getSessionUser");
  const dbUser = await getSessionUser();
  if (TRACE) console.timeEnd("layout:navbar.getSessionUser");

  return (
    <Navbar
      isAdmin={dbUser?.role === "ADMIN"}
      totalCredits={dbUser?.credits ?? 0}
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
