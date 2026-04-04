import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { getSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Flower2, CalendarDays, Home, CircleUserRound, Settings } from "lucide-react";

export async function Navbar() {
  const dbUser = await getSessionUser();
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
    <header dir="rtl" className="sticky top-0 z-50 w-full border-b border-sage-100/50 bg-white/95 backdrop-blur-xl">
      <div className="hide-scrollbar overflow-x-auto whitespace-nowrap">
        <div className="flex min-w-full items-center gap-1.5 px-4 py-2.5 md:mx-auto md:max-w-7xl md:gap-2 md:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2 pl-2 text-sage-800" aria-label="נועה יוגה">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
              <Flower2 className="h-4 w-4" />
            </span>
            <span className="text-base font-bold md:text-lg">נועה יוגה</span>
          </Link>

          <span className="mx-1 hidden h-5 w-px shrink-0 bg-sage-200 sm:block" />

          <Link href="/" className="flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium text-sage-600 transition-colors hover:bg-sage-50 active:bg-sage-100">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">עמוד הבית</span>
          </Link>

          <Link href="/schedule" className="flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium text-sage-600 transition-colors hover:bg-sage-50 active:bg-sage-100">
            <CalendarDays className="h-4 w-4" />
            מערכת שעות
          </Link>

          <Show when="signed-in">
            <Link href="/profile" className="flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium text-sage-600 transition-colors hover:bg-sage-50 active:bg-sage-100">
              <CircleUserRound className="h-4 w-4" />
              <span className="hidden sm:inline">אזור אישי</span>
              <span className="rounded-full bg-sage-100 px-1.5 py-0.5 text-[10px] font-semibold text-sage-500">{totalCredits}</span>
            </Link>

            {isAdmin && (
              <Link href="/admin" className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-sage-100 px-3 py-2 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-200 active:bg-sage-300">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">ניהול מערכת</span>
              </Link>
            )}

            <div className="shrink-0">
              <UserButton />
            </div>
          </Show>

          <Show when="signed-out">
            <Link href="/sign-in" className="flex shrink-0 items-center rounded-2xl bg-sage-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sage-700 active:bg-sage-800">
              התחברות
            </Link>
            <Link href="/sign-up" className="flex shrink-0 items-center rounded-2xl border border-sage-200 px-3 py-2 text-sm font-medium text-sage-600 transition-colors hover:bg-sage-50 active:bg-sage-100">
              הרשמה
            </Link>
          </Show>
        </div>
      </div>
    </header>
  );
}
