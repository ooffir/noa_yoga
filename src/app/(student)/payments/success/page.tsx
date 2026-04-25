import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getDbUser } from "@/lib/get-db-user";
import { BookingEngine } from "@/lib/booking-engine";
import {
  completePaymentSuccess,
  failPayment,
  isPaymeSuccess,
  isPaymeFailure,
} from "@/lib/payments";
import {
  creditsForPaymentType,
  productLabelFor,
} from "@/lib/product-catalog";
import {
  verifyPaymeSale,
  verifyPaymeSaleByCustomRef,
} from "@/lib/payme-verify";
import { PendingResolver } from "@/components/payments/pending-resolver";

// Always read live state — no caching on this page.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

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
      // ─── Phase 1 — URL-based self-heal (legacy path, kept as first-try) ───
      // If PayMe redirected with a sale code in the URL, verify that
      // specific sale directly. Cheaper than the custom-ref lookup
      // because we don't need a list scan.
      const urlSaleCode = sp.payme_sale_code || sp.sale_code || null;
      if (
        isPaymeSuccess({
          payme_status: sp.payme_status,
          status: sp.status,
          status_code: sp.status_code,
        }) &&
        urlSaleCode
      ) {
        const verification = await verifyPaymeSale(urlSaleCode);
        if (verification.ok) {
          await completePaymentSuccess(paymentId, urlSaleCode);
        } else {
          console.error(
            "[payments/success] URL success claim failed verification:",
            verification,
          );
        }
      } else if (
        isPaymeFailure({ payme_status: sp.payme_status, status: sp.status })
      ) {
        await failPayment(paymentId);
      }

      // ─── Phase 2 — ACTIVE custom-ref lookup ───
      // If we still don't see COMPLETED in the DB (either the URL didn't
      // include a sale code OR the webhook hasn't landed yet), actively
      // ask PayMe via /api/get-sales filtered by custom_1=pay:<paymentId>.
      // This is the synchronous verification the user requested — it
      // resolves the page without depending on the IPN at all.
      let dbPayment = await db.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, type: true },
      });

      if (dbPayment && dbPayment.status === "PENDING") {
        const activeLookup = await verifyPaymeSaleByCustomRef(`pay:${paymentId}`);
        if (activeLookup.ok && activeLookup.isCaptured) {
          // Found a captured sale — complete idempotently. The webhook
          // landing later is harmless; completePaymentSuccess returns
          // `already_completed` on the second call.
          await completePaymentSuccess(paymentId, activeLookup.saleCode);
          // Re-read after the active resolution.
          dbPayment = await db.payment.findUnique({
            where: { id: paymentId },
            select: { status: true, type: true },
          });
        } else if (
          activeLookup.ok === false &&
          activeLookup.reason !== "no_sales_found" &&
          activeLookup.reason !== "network_error"
        ) {
          // Hard-rejected lookup (api_error, seller_mismatch, missing_config)
          // is worth surfacing in logs — the operator might have a misconfig.
          console.error(
            "[payments/success] custom-ref lookup rejected:",
            activeLookup,
          );
        }
        // network_error / no_sales_found just fall through; the resolver
        // component below handles the residual "still pending" cases.
      }

      if (dbPayment) {
        status =
          dbPayment.status === "REFUNDED" ? "COMPLETED" : dbPayment.status;
        productLabel = productLabelFor(dbPayment.type);
        creditsGranted = creditsForPaymentType(dbPayment.type);
      }

      // ─── Auto-book the class the user came from (if applicable) ───
      // Only after the payment is confirmed COMPLETED. Engine deducts the
      // credit; we just granted one — net effect for SINGLE_CLASS is
      // 0 remaining, perfect.
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

          {/* PENDING after both URL self-heal AND custom-ref lookup —
              very rare. Could be: PayMe latency > 8s, sandbox quirk, or
              the user landed before PayMe even captured. The resolver
              component runs a brief silent retry then escalates. */}
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
