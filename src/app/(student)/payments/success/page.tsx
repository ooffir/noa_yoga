import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Clock3, XCircle } from "lucide-react";
import { db } from "@/lib/db";

// Always read live state so the banner reflects the webhook update.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ payment?: string }>;
}

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const { payment: paymentId } = await searchParams;

  let status: "COMPLETED" | "PENDING" | "FAILED" | "UNKNOWN" = "UNKNOWN";
  let productLabel = "";

  if (paymentId) {
    try {
      const payment = await db.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, type: true },
      });
      if (payment) {
        status = payment.status === "REFUNDED" ? "COMPLETED" : payment.status;
        productLabel =
          payment.type === "PUNCH_CARD" ? "כרטיסיית 10 שיעורים" : "שיעור בודד";
      }
    } catch {}
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
              <p className="text-sage-500 mb-6">
                {productLabel
                  ? `${productLabel} נוספה לחשבון שלכם.`
                  : "הקרדיטים נוספו לחשבון שלכם."}
              </p>
            </>
          )}

          {status === "PENDING" && (
            <>
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock3 className="h-8 w-8 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold text-sage-900 mb-2">
                התשלום בעיבוד
              </h1>
              <p className="text-sage-500 mb-6">
                אנחנו ממתינים לאישור מחברת הסליקה. ניתן לרענן את הדף בעוד כמה שניות.
              </p>
            </>
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
                  <Button className="rounded-2xl">הרשמה לשיעור</Button>
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
