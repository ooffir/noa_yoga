import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { getSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { CircleUserRound, Flower2 } from "lucide-react";
import { MobileMenu } from "@/components/layout/mobile-menu";

export async function Navbar() {
  const dbUser = await getSessionUser();
  const firstName = dbUser?.name?.split(" ")[0] || "";
  const isAdmin = dbUser?.role === "ADMIN";

  let totalCredits = dbUser?.credits ?? 0;
  if (dbUser) {
    const pcCredits = await prisma.punchCard.aggregate({
      where: { userId: dbUser.id, status: "ACTIVE" },
      _sum: { remainingCredits: true },
    });
    totalCredits += pcCredits._sum.remainingCredits ?? 0;
  }

  return (
    <header
      dir="rtl"
      className="w-full sticky top-0 z-50 border-b border-sage-100/50 bg-white/90 backdrop-blur-xl"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between w-full">
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <div className="md:hidden">
            <MobileMenu
              signedIn={Boolean(dbUser)}
              isAdmin={isAdmin}
              totalCredits={totalCredits}
            />
          </div>

          <Show when="signed-in">
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden md:inline-flex rounded-xl bg-sage-100 px-3 py-1.5 text-xs font-medium text-sage-600 transition-colors hover:bg-sage-200"
              >
                ניהול מערכת
              </Link>
            )}
            <Link
              href="/profile"
              className="hidden md:flex items-center gap-1.5 rounded-xl bg-sage-50 px-2.5 py-1.5 text-xs font-medium text-sage-600 transition-colors hover:bg-sage-100 sm:px-3 sm:text-sm"
            >
              <CircleUserRound className="h-4 w-4" />
              <span className="hidden md:inline">אזור אישי</span>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-sage-500">
                {totalCredits}
              </span>
            </Link>
            <div className="hidden shrink-0 md:block">
              <UserButton />
            </div>
            {firstName && (
              <span className="hidden lg:block truncate text-xs text-sage-500">
                שלום, <span className="font-semibold text-sage-700">{firstName}</span>
              </span>
            )}
          </Show>

          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="hidden md:inline-flex rounded-xl bg-sage-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sage-700 sm:px-3 sm:text-sm"
            >
              התחברות
            </Link>
            <Link
              href="/sign-up"
              className="hidden md:inline-flex rounded-xl border border-sage-200 px-2.5 py-1.5 text-xs font-medium text-sage-600 transition-colors hover:bg-sage-50 sm:px-3 sm:text-sm"
            >
              הרשמה
            </Link>
          </Show>
        </div>

        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-sage-800"
          aria-label="נועה יוגה"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
            <Flower2 className="h-4 w-4" />
          </span>
          <span className="hidden sm:block text-base font-bold lg:text-lg">נועה יוגה</span>
        </Link>
      </div>
    </header>
  );
}
