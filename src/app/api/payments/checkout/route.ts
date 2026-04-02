import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { stripe, PRICES } from "@/lib/stripe";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type } = await req.json();
    const userId = dbUser.id;

    if (!["SINGLE_CLASS", "PUNCH_CARD"].includes(type)) {
      return NextResponse.json({ error: "Invalid purchase type" }, { status: 400 });
    }

    const priceId = type === "PUNCH_CARD" ? PRICES.PUNCH_CARD : PRICES.SINGLE_CLASS;

    const payment = await db.payment.create({
      data: {
        userId,
        type,
        amount: type === "PUNCH_CARD" ? 35000 : 5000, // placeholder amounts in agorot
        status: "PENDING",
      },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/payments/cancelled`,
      metadata: {
        userId,
        paymentId: payment.id,
        type,
      },
      customer_email: dbUser.email,
    });

    await db.payment.update({
      where: { id: payment.id },
      data: { stripeSessionId: checkoutSession.id },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
