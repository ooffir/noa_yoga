import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

/**
 * Admin list of pending / stuck payments and workshop registrations.
 * Used by the admin "Stuck Payments" rescue UI.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [payments, registrations] = await Promise.all([
    db.payment.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { email: true, name: true } },
      },
    }),
    db.workshopRegistration.findMany({
      where: { paymentStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { email: true, name: true } },
        workshop: { select: { title: true, price: true } },
      },
    }),
  ]);

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id,
      userId: p.userId,
      userEmail: p.user.email,
      userName: p.user.name,
      amount: p.amount,
      type: p.type,
      createdAt: p.createdAt,
    })),
    registrations: registrations.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.user.email,
      userName: r.user.name,
      workshopTitle: r.workshop.title,
      workshopPrice: r.workshop.price,
      createdAt: r.createdAt,
    })),
  });
}
