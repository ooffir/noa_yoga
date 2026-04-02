"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, User, CreditCard, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "בית" },
  { href: "/schedule", icon: Calendar, label: "שיעורים" },
  { href: "/pricing", icon: CreditCard, label: "מחירון" },
  { href: "/profile", icon: User, label: "אזור אישי" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-sage-100 bg-white/90 backdrop-blur-lg md:hidden safe-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                isActive ? "text-sage-700 font-medium" : "text-sage-400"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-sage-600")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
