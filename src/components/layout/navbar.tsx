import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { getSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { CircleUserRound, Flower2 } from "lucide-react";

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
    <header className="sticky top-0 z-40 border-b border-sage-100/50 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-lg flex-row-reverse items-center justify-between gap-2 px-4">
        <div className="min-w-0 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2 text-sage-800"
            aria-label="נועה יוגה"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
              <Flower2 className="h-4 w-4" />
            </span>
            <span className="hidden text-base font-bold sm:block">נועה יוגה</span>
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
          <Show when="signed-in">
            {firstName && (
              <span className="hidden truncate text-xs text-sage-500 sm:block">
                שלום, <span className="font-semibold text-sage-700">{firstName}</span>
              </span>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-xl bg-sage-100 px-2.5 py-1 text-[11px] font-medium text-sage-600 transition-colors hover:bg-sage-200"
              >
                ניהול מערכת
              </Link>
            )}
          </Show>
          <Show when="signed-out">
            <div className="flex items-center gap-2">
              <Link
                href="/sign-in"
                className="rounded-xl bg-sage-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-sage-700"
              >
                התחברות
              </Link>
              <Link
                href="/sign-up"
                className="rounded-xl border border-sage-200 px-3 py-1.5 text-[11px] font-medium text-sage-600 transition-colors hover:bg-sage-50"
              >
                הרשמה
              </Link>
            </div>
          </Show>
        </div>

        <div className="z-10 flex shrink-0 items-center gap-2">
          <Show when="signed-in">
            <Link
              href="/profile"
              className="flex items-center gap-1.5 rounded-xl bg-sage-50 px-2 py-1 text-[11px] font-medium text-sage-600 transition-colors hover:bg-sage-100"
            >
              <CircleUserRound className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">אזור אישי</span>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-sage-500">
                {totalCredits}
              </span>
            </Link>
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
