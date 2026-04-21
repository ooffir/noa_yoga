"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { LayoutDashboard, Calendar, Users, LogOut, Home, UserCog, Newspaper, Settings, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const adminItems = [
  { href: "/admin", icon: LayoutDashboard, label: "לוח בקרה" },
  { href: "/admin/schedule", icon: Calendar, label: "שיעורים" },
  { href: "/admin/users", icon: UserCog, label: "תלמידות" },
  { href: "/admin/attendance", icon: Users, label: "נוכחות" },
  { href: "/admin/workshops", icon: Sparkles, label: "סדנאות" },
  { href: "/admin/articles", icon: Newspaper, label: "כתבות" },
  { href: "/admin/payments", icon: AlertTriangle, label: "תשלומים תקועים" },
  { href: "/admin/settings", icon: Settings, label: "הגדרות" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div dir="rtl" className="sticky top-[57px] z-[90] w-full border-b border-sage-100 bg-[#FDFBF7] shadow-sm">
      <div className="hide-scrollbar overflow-x-auto whitespace-nowrap">
        <div className="flex min-w-full items-center gap-1.5 px-4 py-2 md:mx-auto md:max-w-7xl md:gap-2 md:px-8">
          {adminItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sage-600 text-white shadow-sm"
                    : "bg-sage-50 text-sage-600 hover:bg-sage-100 active:bg-sage-200"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          <span className="mx-1 h-5 w-px shrink-0 bg-sage-200" />

          <Link href="/" className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-medium text-sage-500 transition-colors hover:bg-sage-50">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">חזרה לאתר</span>
          </Link>

          <SignOutButton>
            <button className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 active:bg-red-100">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">התנתקות</span>
            </button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
