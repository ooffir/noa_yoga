import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("Stripe-Signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, paymentId, type } = session.metadata!;

    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        stripePaymentId: session.payment_intent as string,
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
  }

  return NextResponse.json({ received: true });
}
