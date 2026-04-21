import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Auto-cleanup cron: fail stuck PENDING payments & registrations.
 *
 * Any row that stays in PENDING for > 2 hours is almost certainly
 * abandoned (user clicked checkout, left PayMe without finishing,
 * browser closed, etc.). Left untouched, they clutter the admin
 * "stuck payments" page forever and burn `unique (userId, workshopId)`
 * slots that block future registrations for the same workshop.
 *
 * Vercel Cron usage (configure in the Vercel dashboard or vercel.json):
 *   path: /api/cron/cleanup-pending-payments
 *   schedule: "0 * * * *"      (hourly)
 *   headers: { Authorization: "Bearer <CRON_SECRET>" }
 *
 * Manual trigger for debugging:
 *   curl -X POST https://.../api/cron/cleanup-pending-payments \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Idempotency: only rows with status === PENDING are touched. Running
 * it ten times in a row after the first call does nothing.
 */

export const dynamic = "force-dynamic";

const STALE_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

async function runCleanup() {
  const cutoff = new Date(Date.now() - STALE_AGE_MS);

  const [payments, registrations] = await Promise.all([
    db.payment.updateMany({
      where: {
        status: "PENDING",
        createdAt: { lt: cutoff },
      },
      data: { status: "FAILED" },
    }),
    db.workshopRegistration.updateMany({
      where: {
        paymentStatus: "PENDING",
        createdAt: { lt: cutoff },
      },
      data: { paymentStatus: "CANCELLED" },
    }),
  ]);

  return {
    cutoff: cutoff.toISOString(),
    staleAgeHours: STALE_AGE_MS / 1000 / 60 / 60,
    failedPayments: payments.count,
    cancelledRegistrations: registrations.count,
  };
}

function authorize(req: Request): NextResponse | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// Vercel Cron sends GET with the Authorization header.
export async function GET(req: Request) {
  const unauth = authorize(req);
  if (unauth) return unauth;

  try {
    const result = await runCleanup();
    console.log("[cleanup-pending] result:", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cleanup-pending] error:", error);
    return NextResponse.json(
      { error: "Cleanup failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// Allow POST for manual admin triggers / ad-hoc runs too.
export async function POST(req: Request) {
  return GET(req);
}
