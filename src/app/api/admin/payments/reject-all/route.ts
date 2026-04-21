import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

/**
 * Admin bulk cleanup: mark every PENDING Payment as FAILED and every
 * PENDING WorkshopRegistration as CANCELLED. Useful after PayMe test
 * attempts leave the stuck-payments list full.
 *
 * POST /api/admin/payments/reject-all
 */

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [payments, registrations] = await Promise.all([
    db.payment.updateMany({
      where: { status: "PENDING" },
      data: { status: "FAILED" },
    }),
    db.workshopRegistration.updateMany({
      where: { paymentStatus: "PENDING" },
      data: { paymentStatus: "CANCELLED" },
    }),
  ]);

  console.log("[payments] bulk reject:", {
    payments: payments.count,
    registrations: registrations.count,
  });

  return NextResponse.json({
    ok: true,
    payments: payments.count,
    registrations: registrations.count,
  });
}
