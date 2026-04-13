import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { createPaymentLink } from "@/lib/payplus";

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "יש להתחבר תחילה" }, { status: 401 });
    }

    const { type } = await req.json();

    if (!["SINGLE_CLASS", "PUNCH_CARD"].includes(type)) {
      return NextResponse.json({ error: "סוג רכישה לא תקין" }, { status: 400 });
    }

    let creditPrice = 50;
    let punchCardPrice = 350;

    try {
      const settings = await db.siteSettings.findUnique({
        where: { id: "main" },
        select: { creditPrice: true, punchCardPrice: true },
      });
      if (settings) {
        creditPrice = settings.creditPrice;
        punchCardPrice = settings.punchCardPrice;
      }
    } catch {}

    const amount = type === "PUNCH_CARD" ? punchCardPrice : creditPrice;
    const description = type === "PUNCH_CARD" ? "כרטיסיית 10 שיעורים" : "שיעור בודד";

    const payment = await db.payment.create({
      data: {
        userId: dbUser.id,
        type,
        amount: amount * 100,
        status: "PENDING",
      },
    });

    const moreInfo = JSON.stringify({
      userId: dbUser.id,
      paymentId: payment.id,
      type,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const result = await createPaymentLink({
      amount,
      description,
      customerEmail: dbUser.email,
      customerName: dbUser.name || dbUser.email,
      moreInfo,
      successUrl: `${appUrl}/payments/success`,
      failureUrl: `${appUrl}/pricing`,
    });

    await db.payment.update({
      where: { id: payment.id },
      data: { paymentPageUid: result.pageRequestUid },
    });

    return NextResponse.json({ url: result.url });
  } catch (error: any) {
    console.error("PayPlus checkout error:", error?.message || error);
    return NextResponse.json(
      { error: "יצירת עמוד תשלום נכשלה" },
      { status: 500 }
    );
  }
}
