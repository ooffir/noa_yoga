"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { LayoutDashboard, Calendar, Users, LogOut, Home, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

const sidebarItems = [
  { href: "/admin", icon: LayoutDashboard, label: "לוח בקרה" },
  { href: "/admin/schedule", icon: Calendar, label: "ניהול שיעורים" },
  { href: "/admin/users", icon: UserCog, label: "ניהול תלמידות" },
  { href: "/admin/attendance", icon: Users, label: "נוכחות" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 flex-col border-l border-sage-100 bg-white">
      <div className="flex h-16 items-center justify-center border-b border-sage-100 px-6">
        <span className="text-lg font-bold text-sage-800">ניהול מערכת</span>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {sidebarItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sage-50 text-sage-900"
                  : "text-sage-500 hover:bg-sage-50 hover:text-sage-700"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sage-100 p-4 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-sage-500 hover:bg-sage-50 transition-colors"
        >
          <Home className="h-5 w-5" />
          חזרה לאתר
        </Link>
        <SignOutButton>
          <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors">
            <LogOut className="h-5 w-5" />
            התנתקות
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
