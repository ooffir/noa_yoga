"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/loading";

/**
 * Pure DB-status poller for the /payments/success page.
 *
 * Behavior:
 *   1. Every 2 seconds, POST to /api/payments/resolve { paymentId }.
 *   2. The endpoint returns whatever status our DB currently holds.
 *   3. If COMPLETED → router.refresh() so the server component
 *      re-renders with the green success card.
 *   4. If FAILED → router.refresh() so the user sees the failure card.
 *   5. If still PENDING → keep polling, with friendly progress dots.
 *
 * No PayMe API calls. The webhook at /api/webhooks/payme is the only
 * thing that flips status to COMPLETED; this component just waits for
 * that to happen.
 *
 * Patience: 15 attempts × 2 seconds = 30 seconds max wait before showing
 * the "receipt is on its way" softening message. The poll keeps running
 * silently in the background even after the visible message changes —
 * the webhook can still arrive minutes later (PayMe's IPN retry policy
 * is forgiving).
 */

const VISIBLE_ATTEMPTS = 15;          // ~30 seconds of progress dots
const RETRY_INTERVAL_MS = 2000;
const HARD_STOP_AFTER_MS = 10 * 60 * 1000; // give up polling after 10 min

interface Props {
  paymentId: string;
}

export function PendingResolver({ paymentId }: Props) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel-on-unmount guard so we don't router.refresh() after navigating away.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/payments/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
        });

        if (cancelled || cancelledRef.current) return;

        if (res.ok) {
          const data = await res.json();
          if (data.status === "COMPLETED" || data.status === "FAILED") {
            // DB has resolved → re-render the server component.
            router.refresh();
            return;
          }
        }

        // Still PENDING → schedule the next poll, unless we've hit the
        // hard stop. The component stays mounted and the spinner keeps
        // turning even past VISIBLE_ATTEMPTS — only the message softens.
        if (Date.now() - startedAtRef.current < HARD_STOP_AFTER_MS) {
          timerRef.current = setTimeout(() => {
            if (!cancelledRef.current) setAttempt((n) => n + 1);
          }, RETRY_INTERVAL_MS);
        }
      } catch {
        // Network blips count as "still pending" — try again next tick.
        if (Date.now() - startedAtRef.current < HARD_STOP_AFTER_MS) {
          timerRef.current = setTimeout(() => {
            if (!cancelledRef.current) setAttempt((n) => n + 1);
          }, RETRY_INTERVAL_MS);
        }
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [attempt, paymentId, router]);

  // Past 30 seconds, soften the message. The poll continues silently —
  // the user just sees friendlier copy because waiting longer is normal.
  const isVisibleWindow = attempt < VISIBLE_ATTEMPTS;

  return (
    <div className="py-2">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sage-50">
        <Spinner className="h-8 w-8 text-sage-600" />
      </div>

      <h1 className="text-xl font-bold text-sage-900 mb-2">
        מאמתים את התשלום…
      </h1>

      {isVisibleWindow ? (
        <p className="text-sage-500 leading-relaxed text-sm max-w-xs mx-auto">
          רק כמה שניות והכל יהיה מוכן 🌿
        </p>
      ) : (
        <p className="text-sage-500 leading-relaxed text-sm max-w-xs mx-auto">
          האימות לוקח מעט יותר מהרגיל. <strong>קיבלת קבלה למייל</strong> —
          הקרדיטים יוצגו בחשבון תוך דקה.
        </p>
      )}

      {/* Progress dots — visible during the first ~30s, then hidden so
          the layout doesn't keep growing as the wait extends. */}
      {isVisibleWindow && (
        <div className="mt-6 flex items-center justify-center gap-1.5">
          {Array.from({ length: VISIBLE_ATTEMPTS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i <= attempt ? "bg-sage-500" : "bg-sage-100"
              }`}
              aria-hidden
            />
          ))}
        </div>
      )}
    </div>
  );
}
