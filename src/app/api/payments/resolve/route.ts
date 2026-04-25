import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { completePaymentSuccess } from "@/lib/payments";
import { verifyPaymeSaleByCustomRef } from "@/lib/payme-verify";

/**
 * POST /api/payments/resolve
 *
 * Body: { paymentId: string }
 *
 * Active synchronous-resolution endpoint used by the success page when
 * the IPN webhook hasn't landed yet. Calls PayMe's /api/get-sales
 * filtered by `custom_1=pay:<paymentId>` to determine the live status
 * and idempotently completes our DB row if the sale was captured.
 *
 * Authorization: must be the same user who owns the Payment row, OR an
 * ADMIN. We don't want users probing each other's payment statuses.
 *
 * Returns: { status, credits, completed } — the latest known DB status
 * after the active check + any completion attempt.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const paymentId = body.paymentId;
  if (!paymentId || typeof paymentId !== "string") {
    return NextResponse.json({ error: "paymentId required" }, { status: 400 });
  }

  // Ownership check — block cross-user lookups.
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { userId: true, status: true, type: true },
  });
  if (!payment) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (payment.userId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Already completed? Short-circuit — no need to call PayMe.
  if (payment.status === "COMPLETED") {
    const punchCard = await db.punchCard.findFirst({ where: { paymentId } });
    return NextResponse.json({
      status: "COMPLETED",
      credits: punchCard?.totalCredits ?? 0,
      completed: false, // not by THIS request — already was
    });
  }

  if (payment.status === "REFUNDED") {
    return NextResponse.json({ status: "REFUNDED", credits: 0, completed: false });
  }

  if (payment.status === "FAILED") {
    return NextResponse.json({ status: "FAILED", credits: 0, completed: false });
  }

  // PENDING — actively ask PayMe.
  const lookup = await verifyPaymeSaleByCustomRef(`pay:${paymentId}`);

  if (lookup.ok && lookup.isCaptured) {
    const result = await completePaymentSuccess(paymentId, lookup.saleCode);
    return NextResponse.json({
      status: "COMPLETED",
      credits: "credits" in result ? result.credits : 0,
      completed: result.kind === "completed",
    });
  }

  // Lookup failed or sale not yet captured.
  return NextResponse.json({
    status: "PENDING",
    credits: 0,
    completed: false,
    reason:
      lookup.ok === false
        ? lookup.reason
        : "sale_not_captured_yet",
  });
}
