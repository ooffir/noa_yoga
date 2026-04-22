import Link from "next/link";
import { CalendarDays, Compass, Home } from "lucide-react";

/**
 * Global 404 page for any URL that doesn't match a route.
 * Triggered by Next.js router miss OR by explicit `notFound()` calls
 * in server components (e.g., an article slug that doesn't exist).
 */
export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-sage-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sage-50">
          <Compass className="h-8 w-8 text-sage-500" />
        </div>

        <p className="text-sm font-semibold uppercase tracking-wider text-sage-400">
          404
        </p>
        <h1 className="mt-1 text-2xl font-bold text-sage-900 mb-2">
          העמוד שחיפשת לא נמצא.
        </h1>
        <p className="text-sage-500 leading-relaxed mb-6">
          יכול להיות שהקישור התיישן או שהעמוד הוסר. כדאי לחזור למערכת השעות —
          שם כל הפעילות השבועית מעודכנת.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/schedule"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sage-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sage-700 active:scale-[0.97]"
          >
            <CalendarDays className="h-4 w-4" />
            חזרה למערכת השעות
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-sage-200 bg-white px-6 py-3 text-sm font-semibold text-sage-700 transition-all hover:border-sage-300 hover:bg-sage-50 active:scale-[0.97]"
          >
            <Home className="h-4 w-4" />
            לעמוד הבית
          </Link>
        </div>
      </div>
    </div>
  );
}
