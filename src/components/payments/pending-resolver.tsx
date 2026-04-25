"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/loading";

/**
 * Sleek auto-resolver for the /payments/success page when the server-side
 * verification chain (URL-based + custom-ref active lookup) didn't finish
 * resolving the payment to COMPLETED before render.
 *
 * Flow on mount:
 *   1. POST /api/payments/resolve { paymentId } — actively re-checks PayMe.
 *   2. If status comes back COMPLETED → router.refresh() so the server
 *      component re-renders with the green success card.
 *   3. If still PENDING → wait 1.5s and retry, up to 4 attempts total.
 *   4. After max attempts, the spinner stays visible and the message
 *      softens to "התקבלת קבלה למייל — הקרדיטים יעודכנו תוך דקה".
 *
 * No manual "בדיקה ידנית" button. The user just sees a friendly spinner
 * for a couple of seconds and then the success card appears. If PayMe
 * truly takes more than ~10 seconds, we fall back to the "receipt is on
 * its way" message rather than asking the user to press anything.
 */

const MAX_ATTEMPTS = 4;
const RETRY_INTERVAL_MS = 1500;

interface Props {
  paymentId: string;
}

export function PendingResolver({ paymentId }: Props) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cancel-on-unmount guard so we don't router.refresh() after navigating away.
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tryResolve() {
      try {
        const res = await fetch("/api/payments/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
        });

        if (cancelled || cancelledRef.current) return;

        if (res.ok) {
          const data = await res.json();
          if (data.status === "COMPLETED") {
            // Refresh the server component so the success card replaces this
            // component on the next render.
            router.refresh();
            return;
          }
          if (data.status === "FAILED") {
            router.refresh();
            return;
          }
        }

        // Still pending — schedule another attempt unless we've exhausted.
        if (attempt + 1 < MAX_ATTEMPTS) {
          timerRef.current = setTimeout(() => {
            if (!cancelledRef.current) setAttempt((n) => n + 1);
          }, RETRY_INTERVAL_MS);
        } else {
          setExhausted(true);
        }
      } catch {
        // Network blips → just try again next tick (counts toward attempts).
        if (attempt + 1 < MAX_ATTEMPTS) {
          timerRef.current = setTimeout(() => {
            if (!cancelledRef.current) setAttempt((n) => n + 1);
          }, RETRY_INTERVAL_MS);
        } else {
          setExhausted(true);
        }
      }
    }

    tryResolve();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [attempt, paymentId, router]);

  return (
    <div className="py-2">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sage-50">
        <Spinner className="h-8 w-8 text-sage-600" />
      </div>

      <h1 className="text-xl font-bold text-sage-900 mb-2">
        מאמתים את התשלום…
      </h1>

      {!exhausted ? (
        <p className="text-sage-500 leading-relaxed text-sm max-w-xs mx-auto">
          מאמתים נתונים מול חברת האשראי, רק כמה שניות והכל יהיה מוכן 🌿
        </p>
      ) : (
        <p className="text-sage-500 leading-relaxed text-sm max-w-xs mx-auto">
          האימות לוקח מעט יותר מהרגיל. <strong>קיבלת קבלה למייל</strong> —
          הקרדיטים יוצגו בחשבון תוך דקה לכל היותר.
        </p>
      )}

      {/* Tiny progress dots — pure decoration, makes the wait feel intentional */}
      <div className="mt-6 flex items-center justify-center gap-1.5">
        {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i <= attempt ? "bg-sage-500" : "bg-sage-100"
            }`}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
