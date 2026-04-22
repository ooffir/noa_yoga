"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * Global error boundary for the App Router. Triggered whenever a
 * Server Component throws an uncaught exception below the root layout.
 *
 * Must be a Client Component so React can mount it after the error.
 * The root layout (with <html>, <body>, ClerkProvider, RTL direction)
 * stays intact — only the content area is replaced by this fallback.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side this won't run, but client-side it logs to the browser
    // console + any wired-up Sentry-like tool for debugging.
    console.error("[app:error.tsx]", error);
  }, [error]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-sage-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>

        <h1 className="text-2xl font-bold text-sage-900 mb-2">
          אופס, משהו השתבש בצד שלנו.
        </h1>
        <p className="text-sage-500 leading-relaxed mb-6">
          הצוות שלנו קיבל התראה על התקלה. ניתן לנסות שוב, או לחזור לעמוד הבית.
        </p>

        {error.digest && (
          <p className="mb-6 text-[11px] text-sage-400 font-mono">
            מזהה תקלה: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sage-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sage-700 active:scale-[0.97]"
          >
            <RefreshCw className="h-4 w-4" />
            נסה שוב
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-sage-200 bg-white px-6 py-3 text-sm font-semibold text-sage-700 transition-all hover:border-sage-300 hover:bg-sage-50 active:scale-[0.97]"
          >
            <Home className="h-4 w-4" />
            חזרה לבית
          </Link>
        </div>
      </div>
    </div>
  );
}
