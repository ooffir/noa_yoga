import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

/**
 * POST /api/payments/resolve
 *
 * DB-only status check. Returns the current Payment status as written
 * by the IPN webhook. Used by <PendingResolver> on /payments/success
 * to poll until the webhook flips PENDING → COMPLETED.
 *
 * This endpoint deliberately does NOT call PayMe's API. Production
 * experience showed PayMe's `/get-sales` returns 200 OK with empty
 * results even after captured payments for our seller account, which
 * caused legitimate paid customers to see "still pending" indefinitely.
 *
 * Source of truth split:
 *   - Webhook (`/api/webhooks/payme`) = WRITER. Talks to PayMe, decides
 *     when a payment is COMPLETED, has its own emergency-trust mode
 *     using the IPN's price field + DB amount-match.
 *   - This endpoint = READER. Returns whatever the writer last set.
 *
 * Authorization: must be the same user who owns the Payment row, OR an
 * ADMIN.
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

  console.log("[payments/resolve] read", { paymentId, userId: user.id });

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

  console.log("[payments/resolve] db_status", { status: payment.status });

  // Look up the punch card credits if completed (used to populate the
  // success message client-side). One DB query, no PayMe round-trip.
  if (payment.status === "COMPLETED") {
    const punchCard = await db.punchCard.findFirst({ where: { paymentId } });
    return NextResponse.json({
      status: "COMPLETED",
      credits: punchCard?.totalCredits ?? 0,
    });
  }

  return NextResponse.json({
    status: payment.status,
    credits: 0,
  });
}
