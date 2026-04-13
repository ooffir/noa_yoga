import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhook } from "@/lib/payplus";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!verifyWebhook(body)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const data = body?.data || body;

    if (data?.Status_code !== "000") {
      return NextResponse.json({ received: true, status: "not_success" });
    }

    let moreInfo: { userId?: string; paymentId?: string; type?: string } = {};
    try {
      moreInfo =
        typeof data.more_info === "string"
          ? JSON.parse(data.more_info)
          : data.more_info || {};
    } catch {}

    const { userId, paymentId, type } = moreInfo;

    if (!userId || !paymentId || !type) {
      return NextResponse.json({ error: "Missing payment metadata" }, { status: 400 });
    }

    const existingPayment = await db.payment.findUnique({
      where: { id: paymentId },
    });

    if (!existingPayment || existingPayment.status === "COMPLETED") {
      return NextResponse.json({ received: true, status: "already_processed" });
    }

    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        payplusTransactionId: data.transaction_uid || null,
      },
    });

    const credits = type === "PUNCH_CARD" ? 10 : 1;

    await db.punchCard.create({
      data: {
        userId,
        totalCredits: credits,
        remainingCredits: credits,
        paymentId,
      },
    });

    return NextResponse.json({ received: true, status: "completed" });
  } catch (error: any) {
    console.error("PayPlus webhook error:", error?.message || error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
