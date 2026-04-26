import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getDbUser } from "@/lib/get-db-user";
import { BookingEngine } from "@/lib/booking-engine";
import { failPayment, isPaymeFailure } from "@/lib/payments";
import {
  creditsForPaymentType,
  productLabelFor,
} from "@/lib/product-catalog";
import { PendingResolver } from "@/components/payments/pending-resolver";

// Always read live state — no caching on this page.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * Payment-success / pending / failed page.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  Architecture decision: DB is the single source of truth.
 * ──────────────────────────────────────────────────────────────────────
 *
 * This page no longer calls PayMe's `/get-sales` API. The PayMe API has
 * proven unreliable in production for our seller account (returns 200 OK
 * with empty results even after captured payments), so trying to verify
 * here produces a flood of false "still pending" states for legitimate
 * paid customers.
 *
 * Instead:
 *   - The IPN webhook at /api/webhooks/payme is the ONLY thing that
 *     flips a Payment row from PENDING → COMPLETED. It uses an emergency
 *     trust mode (IPN price + amount-match in DB) that doesn't depend
 *     on /get-sales either.
 *   - This page only READS the DB. If status === COMPLETED → green
 *     check immediately. If still PENDING → poll the DB via the
 *     <PendingResolver> client component until it flips.
 *
 * Cancellation/failure URL param is the only edge case we still write
 * for — it sets payment.status = FAILED in our DB so we can show the
 * red banner without making PayMe API calls. No financial data is
 * trusted from URL params; only "this user hit the cancel/fail flow".
 */
export default async function PaymentSuccessPage({ searchParams }: Props) {
  const sp = await searchParams;
  const paymentId = sp.payment;
  const bookClassInstanceId = sp.book;

  let status: "COMPLETED" | "PENDING" | "FAILED" | "UNKNOWN" = "UNKNOWN";
  let productLabel = "";
  let creditsGranted = 0;
  let bookingOutcome:
    | { kind: "booked" }
    | { kind: "waitlist" }
    | { kind: "failed"; reason: string }
    | null = null;

  if (paymentId) {
    try {
      console.log("[payments/success] entry", {
        paymentId,
        urlParams: Object.fromEntries(
          Object.entries(sp).map(([k, v]) => [
            k,
            typeof v === "string" ? v.slice(0, 60) : v,
          ]),
        ),
      });

      // ─── URL-based failure mark (DB-only, no PayMe API call) ───
      // If the user clicked "cancel" inside PayMe and was redirected back
      // with a failure status param, mark the payment FAILED so the page
      // doesn't sit on the pending spinner forever waiting for a webhook
      // that will never arrive (PayMe doesn't IPN cancellations).
      if (
        isPaymeFailure({ payme_status: sp.payme_status, status: sp.status })
      ) {
        await failPayment(paymentId);
        console.log("[payments/success] marked_failed_from_url");
      }

      // ─── Read DB — single source of truth ───
      const dbPayment = await db.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, type: true },
      });

      console.log("[payments/success] db_status", {
        paymentId,
        status: dbPayment?.status,
      });

      if (dbPayment) {
        // REFUNDED is treated as COMPLETED for display — the credits
        // were granted at some point; the refund will eventually freeze
        // the punch card via the refund webhook but the receipt stays.
        status =
          dbPayment.status === "REFUNDED" ? "COMPLETED" : dbPayment.status;
        productLabel = productLabelFor(dbPayment.type);
        creditsGranted = creditsForPaymentType(dbPayment.type);
      }

      // ─── Auto-book the class the user came from (if applicable) ───
      // Only after DB confirms COMPLETED.
      if (status === "COMPLETED" && bookClassInstanceId) {
        try {
          const user = await getDbUser();
          if (user) {
            const result = await BookingEngine.bookClass(
              user.id,
              bookClassInstanceId,
            );
            bookingOutcome =
              result.type === "waitlist" ? { kind: "waitlist" } : { kind: "booked" };
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : "הרישום לשיעור נכשל";
          if (reason.includes("כבר רשום")) {
            bookingOutcome = { kind: "booked" };
          } else {
            bookingOutcome = { kind: "failed", reason };
            console.error("[payments/success] auto-book failed:", err);
          }
        }
      }

      console.log("[payments/success] final_status", { paymentId, status });
    } catch (err) {
      console.error("[payments/success] resolve error:", err);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md text-center rounded-3xl">
        <CardContent className="pt-8 pb-6">
          {status === "COMPLETED" && (
            <>
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-sage-900 mb-2">
                התשלום בוצע בהצלחה!
              </h1>

              {bookingOutcome?.kind === "booked" ? (
                <p className="text-sage-500 mb-6">
                  נרשמת לשיעור בהצלחה 🧘 נתראה על המזרן!
                </p>
              ) : bookingOutcome?.kind === "waitlist" ? (
                <p className="text-sage-500 mb-6">
                  השיעור מלא — נוספת לרשימת ההמתנה. הקרדיט נשמר בחשבונך.
                </p>
              ) : bookingOutcome?.kind === "failed" ? (
                <p className="text-sage-500 mb-6">
                  התשלום התקבל (נוספו {creditsGranted} קרדיטים), אבל ההרשמה לשיעור
                  נכשלה: {bookingOutcome.reason}. ניתן לנסות להירשם מחדש ממערכת השעות.
                </p>
              ) : (
                <p className="text-sage-500 mb-6">
                  {productLabel
                    ? `${productLabel} נוספה לחשבון (${creditsGranted} קרדיטים).`
                    : "הקרדיטים נוספו לחשבון שלכם."}
                </p>
              )}
            </>
          )}

          {/* PENDING → poll the DB until the webhook flips it to COMPLETED.
              This page never calls PayMe's API directly; it only reads
              our DB. The webhook (which has an emergency-trust mode of
              its own) is the single writer that completes payments. */}
          {status === "PENDING" && paymentId && (
            <PendingResolver paymentId={paymentId} />
          )}

          {(status === "FAILED" || status === "UNKNOWN") && (
            <>
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-sage-900 mb-2">
                התשלום לא הושלם
              </h1>
              <p className="text-sage-500 mb-6">
                לא חויבתם. ניתן לנסות שוב בעמוד המחירון.
              </p>
            </>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {status === "COMPLETED" ? (
              <>
                <Link href="/schedule">
                  <Button className="rounded-2xl">
                    {bookingOutcome?.kind === "booked" ? "למערכת השעות" : "הרשמה לשיעור"}
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="outline" className="rounded-2xl">
                    הקרדיטים שלי
                  </Button>
                </Link>
              </>
            ) : status === "FAILED" || status === "UNKNOWN" ? (
              <>
                <Link href="/pricing">
                  <Button className="rounded-2xl">חזרה למחירון</Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" className="rounded-2xl">
                    לעמוד הבית
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
