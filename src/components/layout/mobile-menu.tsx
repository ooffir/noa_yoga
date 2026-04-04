"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  Menu,
  X,
  Home,
  CalendarDays,
  LayoutDashboard,
  LogIn,
  UserPlus,
  CircleUserRound,
} from "lucide-react";

interface MobileMenuProps {
  signedIn: boolean;
  isAdmin: boolean;
  totalCredits: number;
}

export function MobileMenu({
  signedIn,
  isAdmin,
  totalCredits,
}: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="פתיחת תפריט"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sage-200 bg-white text-sage-700 transition-colors hover:bg-sage-50 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden" dir="rtl">
          <button
            type="button"
            aria-label="סגירת תפריט"
            className="absolute inset-0 bg-sage-950/25 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 top-0 flex h-full w-[86vw] max-w-sm flex-col border-l border-sage-100 bg-[#FDFBF7] p-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-bold text-sage-900">תפריט</h2>
              <button
                type="button"
                aria-label="סגירת תפריט"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sage-200 bg-white text-sage-700 transition-colors hover:bg-sage-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="space-y-2 text-right">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-50"
              >
                <span>עמוד הבית</span>
                <Home className="h-4 w-4" />
              </Link>

              <Link
                href="/schedule"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-50"
              >
                <span>מערכת שעות</span>
                <CalendarDays className="h-4 w-4" />
              </Link>

              {signedIn && (
                <Link
                  href="/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-50"
                >
                  <span>אזור אישי</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-sage-50 px-2 py-0.5 text-[11px] text-sage-500">
                      {totalCredits}
                    </span>
                    <CircleUserRound className="h-4 w-4" />
                  </div>
                </Link>
              )}

              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-50"
                >
                  <span>ניהול מערכת</span>
                  <LayoutDashboard className="h-4 w-4" />
                </Link>
              )}
            </nav>

            <div className="mt-6 border-t border-sage-100 pt-5">
              {signedIn ? (
                <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                  <span className="text-sm font-medium text-sage-700">חשבון</span>
                  <UserButton />
                </div>
              ) : (
                <div className="space-y-2">
                  <Link
                    href="/sign-in"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-sage-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sage-700"
                  >
                    <LogIn className="h-4 w-4" />
                    התחברות
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-sage-200 bg-white px-4 py-3 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-50"
                  >
                    <UserPlus className="h-4 w-4" />
                    הרשמה
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
