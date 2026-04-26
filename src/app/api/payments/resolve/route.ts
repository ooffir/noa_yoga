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

// Three layers of "no caching":
//  1. `force-dynamic`     — Next.js will not pre-render or static-cache
//  2. `revalidate = 0`    — never serve from the Data Cache
//  3. `fetchCache="..."`  — disables the per-request fetch cache
// All three together guarantee every poll reaches the DB freshly.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Build a JSON response with explicit no-store headers so neither the
 * browser, an intermediate CDN, nor a service worker can serve a stale
 * "PENDING" snapshot. The poller cache-busts on the request side too;
 * these headers cover the response side.
 */
function jsonNoStore(body: Record<string, unknown>, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function POST(req: Request) {
  const user = await getDbUser();
  if (!user) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ error: "invalid JSON" }, { status: 400 });
  }

  const paymentId = body.paymentId;
  if (!paymentId || typeof paymentId !== "string") {
    return jsonNoStore({ error: "paymentId required" }, { status: 400 });
  }

  console.log("[payments/resolve] read", { paymentId, userId: user.id });

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { userId: true, status: true, type: true },
  });
  if (!payment) {
    console.error("[payments/resolve] not_found", { paymentId });
    return jsonNoStore({ error: "not found" }, { status: 404 });
  }
  if (payment.userId !== user.id && user.role !== "ADMIN") {
    console.error("[payments/resolve] forbidden", { paymentId, userId: user.id });
    return jsonNoStore({ error: "forbidden" }, { status: 403 });
  }

  console.log("[payments/resolve] db_status", {
    paymentId,
    status: payment.status,
  });

  if (payment.status === "COMPLETED") {
    const punchCard = await db.punchCard.findFirst({ where: { paymentId } });
    return jsonNoStore({
      status: "COMPLETED",
      credits: punchCard?.totalCredits ?? 0,
    });
  }

  return jsonNoStore({
    status: payment.status,
    credits: 0,
  });
}
