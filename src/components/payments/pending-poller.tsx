"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Clock3, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

/**
 * Bounded poller for the /payments/success page when a Payment is still PENDING.
 *
 * Why not `<meta http-equiv="refresh">`? A meta refresh has no termination
 * condition — if the webhook never fires, every tab left open hammers the
 * server forever (every 3 seconds → Vercel 429 → full outage). This component
 * replaces that with a capped client poll that cleans up after 10 attempts.
 */

const MAX_ATTEMPTS = 10;
const INTERVAL_MS = 3_000;

export function PendingPoller() {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    // Stop scheduling more polls once we've hit the cap.
    if (attempt >= MAX_ATTEMPTS) return;

    timerRef.current = setTimeout(() => {
      if (stoppedRef.current) return;
      setAttempt((n) => n + 1);
      router.refresh(); // Re-runs the server component; updates status if webhook arrived.
    }, INTERVAL_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [attempt, router]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const manualCheck = () => {
    setRefreshing(true);
    stoppedRef.current = false;
    setAttempt(0); // Restart the poll cycle from zero.
    router.refresh();
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Still polling automatically
  if (attempt < MAX_ATTEMPTS) {
    return (
      <>
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
          <Clock3 className="h-8 w-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-sage-900 mb-2">התשלום בעיבוד</h1>
        <p className="text-sage-500 mb-2">
          אנחנו ממתינים לאישור מחברת הסליקה. הדף יתעדכן אוטומטית.
        </p>
        <p className="text-xs text-sage-400 mb-6">
          בדיקה {attempt + 1} מתוך {MAX_ATTEMPTS}…
        </p>
      </>
    );
  }

  // Cap reached — show manual retry + support message
  return (
    <>
      <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <h1 className="text-2xl font-bold text-sage-900 mb-2">
        התשלום עדיין בעיבוד
      </h1>
      <p className="text-sage-500 mb-2 leading-relaxed">
        לא קיבלנו עדיין אישור מחברת הסליקה. זה יכול לקחת כמה דקות.
      </p>
      <p className="text-sm text-sage-500 mb-6">
        אם הכסף ירד מהחשבון ולא קיבלת קרדיטים תוך 10 דקות, אנא פני אלינו
        ונבדוק ידנית.
      </p>

      <Button onClick={manualCheck} disabled={refreshing} className="rounded-2xl gap-2 mb-4">
        {refreshing ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            בדיקה ידנית
          </>
        )}
      </Button>
    </>
  );
}
