import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { completePaymentSuccess } from "@/lib/payments";
import { verifyPaymeSaleByCustomRef } from "@/lib/payme-verify";

/**
 * POST /api/payments/resolve
 *
 * Active synchronous-resolution endpoint used by <PendingResolver> on
 * /payments/success when the IPN webhook hasn't landed yet. Calls
 * PayMe's `/api/get-sales` filtered by `custom_1=pay:<paymentId>` to
 * determine the live status, then idempotently completes our DB row
 * if PayMe reports the sale as captured.
 *
 * Logs every step with `[payments/resolve]` prefix so a Vercel log
 * search reveals exactly where resolution stopped.
 *
 * Authorization: must be the same user who owns the Payment row, OR an
 * ADMIN. We don't want users probing each other's payment statuses.
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

  console.log("[payments/resolve] start", { paymentId, userId: user.id });

  // Ownership check
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { userId: true, status: true, type: true },
  });
  if (!payment) {
    console.error("[payments/resolve] not_found", { paymentId });
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (payment.userId !== user.id && user.role !== "ADMIN") {
    console.error("[payments/resolve] forbidden", { paymentId, userId: user.id });
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  console.log("[payments/resolve] db_status", { status: payment.status });

  // Already completed → short-circuit, no PayMe call needed.
  if (payment.status === "COMPLETED") {
    const punchCard = await db.punchCard.findFirst({ where: { paymentId } });
    return NextResponse.json({
      status: "COMPLETED",
      credits: punchCard?.totalCredits ?? 0,
      completed: false, // wasn't completed by THIS request
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
  console.log("[payments/resolve] payme_lookup", lookup);

  if (lookup.ok && lookup.isCaptured) {
    // PayMe says captured → safety refresh: complete the DB record now.
    // completePaymentSuccess is idempotent so a future webhook is harmless.
    const result = await completePaymentSuccess(paymentId, lookup.saleCode);
    console.log("[payments/resolve] complete_result", result);

    return NextResponse.json({
      status: "COMPLETED",
      credits: "credits" in result ? result.credits : 0,
      completed: result.kind === "completed",
    });
  }

  // Lookup failed or sale not yet captured.
  console.log("[payments/resolve] still_pending", {
    lookupOk: lookup.ok,
    reason: !lookup.ok ? lookup.reason : "not_captured",
  });

  return NextResponse.json({
    status: "PENDING",
    credits: 0,
    completed: false,
    reason: lookup.ok === false ? lookup.reason : "sale_not_captured_yet",
  });
}
