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
import { PendingPoller } from "@/components/payments/pending-poller";

// Always read live state so the banner reflects the latest DB status.
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
      // ─── Self-heal: complete the payment if PayMe signals success ───
      if (
        isPaymeSuccess({
          payme_status: sp.payme_status,
          status: sp.status,
          status_code: sp.status_code,
        })
      ) {
        await completePaymentSuccess(
          paymentId,
          sp.payme_sale_code || sp.sale_code || null,
        );
      } else if (isPaymeFailure({ payme_status: sp.payme_status, status: sp.status })) {
        await failPayment(paymentId);
      }

      const payment = await db.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, type: true },
      });

      if (payment) {
        status = payment.status === "REFUNDED" ? "COMPLETED" : payment.status;
        productLabel =
          payment.type === "PUNCH_CARD" ? "כרטיסיית 10 שיעורים" : "שיעור בודד";
        creditsGranted = payment.type === "PUNCH_CARD" ? 10 : 1;
      }

      // ─── Auto-book into the class the user clicked "הרשמה" on ───
      // Only fire when:
      //   - payment completed successfully
      //   - the redirect carried a class id to book
      // The booking engine deducts a credit; we just granted one, so the
      // net effect for a single-class purchase is 0 credits remaining.
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
          // Common case: user already booked this class (double-submit). Treat as success.
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

          {status === "PENDING" && <PendingPoller />}

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
            ) : (
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
