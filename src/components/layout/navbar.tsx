import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { getSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { CircleUserRound } from "lucide-react";

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
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Show when="signed-in">
            {firstName && (
              <span className="text-xs text-sage-500">
                שלום, <span className="font-semibold text-sage-700">{firstName}</span>
              </span>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-xl bg-sage-100 px-2.5 py-1 text-[11px] font-medium text-sage-600 hover:bg-sage-200 transition-colors"
              >
                ניהול מערכת
              </Link>
            )}
          </Show>
          <Show when="signed-out">
            <div className="flex items-center gap-2">
              <Link
                href="/sign-in"
                className="rounded-xl bg-sage-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-sage-700 transition-colors"
              >
                התחברות
              </Link>
              <Link
                href="/sign-up"
                className="rounded-xl border border-sage-200 px-3 py-1.5 text-[11px] font-medium text-sage-600 hover:bg-sage-50 transition-colors"
              >
                הרשמה
              </Link>
            </div>
          </Show>
        </div>

        <Link
          href="/"
          className="absolute right-1/2 translate-x-1/2 text-lg font-bold text-sage-800"
        >
          נועה יוגה
        </Link>

        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <Link
              href="/profile"
              className="flex items-center gap-1.5 rounded-xl bg-sage-50 px-2.5 py-1 text-[11px] font-medium text-sage-600 hover:bg-sage-100 transition-colors"
            >
              <CircleUserRound className="h-3.5 w-3.5" />
              <span>אזור אישי</span>
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
