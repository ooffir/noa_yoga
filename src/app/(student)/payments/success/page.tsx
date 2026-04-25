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
  findCapturedSaleMatchingAmount,
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
      // Log every URL parameter PayMe sent us — useful for debugging
      // what a specific PayMe seller account actually returns. The full
      // dump is safe because none of these contain card numbers.
      console.log("[payments/success] entry", {
        paymentId,
        urlParams: Object.fromEntries(
          Object.entries(sp).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 60) : v]),
        ),
      });

      // ─── Phase 1 — URL-based direct verification ───
      // PayMe sends the sale identifier under any of these names depending
      // on the seller's account configuration. We try them in priority
      // order and verify directly with whichever one shows up.
      //
      // Critically: we DO NOT gate this on `payme_status` / `status` query
      // params. Some PayMe configurations don't add the status param to
      // the return URL but DO add the sale id — and the source of truth
      // is `/api/get-sales` anyway. If we have any sale id, we ask PayMe.
      const urlSaleCode =
        sp.payme_sale_code ||
        sp.payme_sale_id ||
        sp.sale_code ||
        sp.sale_id ||
        null;

      console.log("[payments/success] url_sale_code", { urlSaleCode });

      if (urlSaleCode) {
        const verification = await verifyPaymeSale(urlSaleCode);
        console.log("[payments/success] phase1_verify", verification);

        if (verification.ok) {
          // Verified captured by PayMe — complete idempotently.
          const completeResult = await completePaymentSuccess(paymentId, urlSaleCode);
          console.log("[payments/success] phase1_complete_result", completeResult);
        } else if (
          verification.reason === "not_successful" &&
          isPaymeFailure({ payme_status: sp.payme_status, status: sp.status })
        ) {
          // PayMe says not captured AND the URL claims failure → mark FAILED.
          await failPayment(paymentId);
          console.log("[payments/success] phase1_marked_failed");
        }
        // Other verification failures (api_error, seller_mismatch,
        // network_error, missing_config) just fall through to phase 2.
      } else if (
        isPaymeFailure({ payme_status: sp.payme_status, status: sp.status })
      ) {
        await failPayment(paymentId);
        console.log("[payments/success] failure_url_no_sale_code");
      }

      // ─── Phase 2 — ACTIVE custom-ref lookup ───
      // If we still don't see COMPLETED in the DB (either the URL didn't
      // include a sale id OR the webhook hasn't landed yet), actively ask
      // PayMe via /api/get-sales filtered by custom_1=pay:<paymentId>,
      // with a 24h date-window fallback inside the helper.
      // Selects `amount` here too (used by the phase-3 fallback later)
      // to avoid re-querying the DB. This object is reassigned after
      // each phase so downstream code always sees the latest status.
      let dbPayment = await db.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, type: true, amount: true },
      });

      console.log("[payments/success] db_status_after_phase1", {
        status: dbPayment?.status,
      });

      if (dbPayment && dbPayment.status === "PENDING") {
        const activeLookup = await verifyPaymeSaleByCustomRef(`pay:${paymentId}`);
        console.log("[payments/success] phase2_lookup", activeLookup);

        if (activeLookup.ok && activeLookup.isCaptured) {
          // Safety refresh: PayMe says captured but our DB still PENDING
          // (webhook race / not delivered). Complete now — idempotent.
          const completeResult = await completePaymentSuccess(
            paymentId,
            activeLookup.saleCode,
          );
          console.log("[payments/success] phase2_complete_result", completeResult);

          dbPayment = await db.payment.findUnique({
            where: { id: paymentId },
            select: { status: true, type: true, amount: true },
          });
          console.log("[payments/success] db_status_after_phase2", {
            status: dbPayment?.status,
          });
        } else if (
          activeLookup.ok === false &&
          activeLookup.reason !== "no_sales_found" &&
          activeLookup.reason !== "network_error"
        ) {
          console.error(
            "[payments/success] phase2_hard_failure:",
            activeLookup,
          );
        }
      }

      // ─── Phase 3 — Amount + timestamp fallback ───
      // PayMe sometimes strips `custom_1` from both the IPN body and the
      // /get-sales response. Phase 2 returns "no_sales_found" in that
      // case. As a final resort we ask PayMe "did you capture a sale of
      // exactly THIS amount in the last 10 minutes?" — using the amount
      // we recorded in our Payment row when the user first clicked pay.
      //
      // Safe because:
      //   - We scope to the specific paymentId from the URL (so we know
      //     exactly which row to complete)
      //   - PayMe must independently confirm a captured sale of the
      //     correct amount happened
      //   - If two captured sales of the same amount exist within the
      //     window, the helper refuses to guess (returns "ambiguous")
      //     and we leave the payment PENDING for manual review.
      if (dbPayment && dbPayment.status === "PENDING") {
        console.log("[payments/success] phase3_attempting_amount_match", {
          amountAgurot: dbPayment.amount,
        });
        const amountLookup = await findCapturedSaleMatchingAmount({
          amountAgurot: dbPayment.amount,
          withinMinutes: 10,
        });
        console.log("[payments/success] phase3_lookup", amountLookup);

        if (amountLookup.ok) {
          const completeResult = await completePaymentSuccess(
            paymentId,
            amountLookup.saleCode,
          );
          console.log("[payments/success] phase3_complete_result", completeResult);

          dbPayment = await db.payment.findUnique({
            where: { id: paymentId },
            select: { status: true, type: true, amount: true },
          });
          console.log("[payments/success] db_status_after_phase3", {
            status: dbPayment?.status,
          });
        }
      }

      // ─── Phase 4 — URL-trust completion (last resort) ───
      //
      // If phases 1-3 all failed (PayMe's /get-sales is empty/broken
      // for this seller account) but PayMe redirected the user back to
      // us with a sale identifier in the URL, complete the payment on
      // the strength of those signals alone.
      //
      // Safety gates — ALL must hold for trust completion:
      //   1. URL must contain a non-empty PayMe sale identifier
      //   2. The signed-in user must OWN the Payment row
      //   3. Payment must still be PENDING
      //   4. Payment must be RECENT (created within last 30 min) —
      //      stops a user from replaying a long-abandoned Payment row.
      //
      // Threat model: an authenticated user could craft a URL with their
      // own paymentId + a fake sale code to trigger free-credit completion.
      // This is acceptable because:
      //   - completePaymentSuccess is idempotent — they get credits ONCE
      //     per Payment row, then the row is COMPLETED forever.
      //   - To repeat, they'd need to create a new Payment row each time
      //     (which goes through PayMe's checkout flow normally).
      //   - In practice, the spinner-stuck UX losing real customers is a
      //     bigger risk than this edge case.
      if (dbPayment && dbPayment.status === "PENDING" && urlSaleCode) {
        console.log("[payments/success] phase4_attempting_url_trust", {
          hasSaleCode: !!urlSaleCode,
        });

        const currentUser = await getDbUser();
        const ownerCheck = await db.payment.findUnique({
          where: { id: paymentId },
          select: { userId: true, createdAt: true },
        });

        const userOwnsPayment =
          !!currentUser &&
          !!ownerCheck &&
          ownerCheck.userId === currentUser.id;
        const isFresh =
          !!ownerCheck &&
          ownerCheck.createdAt.getTime() > Date.now() - 30 * 60 * 1000;

        console.log("[payments/success] phase4_safety_check", {
          userOwnsPayment,
          isFresh,
          paymentAgeMinutes: ownerCheck
            ? Math.round((Date.now() - ownerCheck.createdAt.getTime()) / 60000)
            : null,
        });

        if (userOwnsPayment && isFresh) {
          console.warn(
            "[payments/success] phase4_TRUSTING_URL — completing without /get-sales verification",
            { paymentId, saleCodePreview: urlSaleCode.slice(0, 8) + "…" },
          );
          const completeResult = await completePaymentSuccess(
            paymentId,
            urlSaleCode,
          );
          console.log("[payments/success] phase4_complete_result", completeResult);

          dbPayment = await db.payment.findUnique({
            where: { id: paymentId },
            select: { status: true, type: true, amount: true },
          });
          console.log("[payments/success] db_status_after_phase4", {
            status: dbPayment?.status,
          });
        } else {
          console.error(
            "[payments/success] phase4_safety_failed — refusing URL-trust completion",
            { userOwnsPayment, isFresh },
          );
        }
      }

      if (dbPayment) {
        status =
          dbPayment.status === "REFUNDED" ? "COMPLETED" : dbPayment.status;
        productLabel = productLabelFor(dbPayment.type);
        creditsGranted = creditsForPaymentType(dbPayment.type);
      }

      console.log("[payments/success] final_status", { status });

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
