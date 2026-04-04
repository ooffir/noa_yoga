import { Navbar } from "@/components/layout/navbar";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-sand-50">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
