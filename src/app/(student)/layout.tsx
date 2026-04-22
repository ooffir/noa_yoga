import { Suspense } from "react";
import { NavbarServer, NavbarSkeleton } from "@/components/layout/navbar-server";
import { Footer } from "@/components/layout/footer";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-sand-50">
      <Suspense fallback={<NavbarSkeleton />}>
        <NavbarServer />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
