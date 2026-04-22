import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

/**
 * GET /api/admin/payments/completed?limit=100
 *
 * Returns all COMPLETED transactions (credit/punch-card purchases + workshop
 * registrations) merged into a single timeline, sorted newest first. Used by
 * the "היסטוריית תשלומים" tab in the admin Payments dashboard.
 *
 * Efficiency notes:
 *   - Two indexed queries run in parallel via Promise.all.
 *   - Only the fields the UI needs are selected (no select: *).
 *   - Default limit of 100 per type — adjustable via ?limit query param —
 *     ensures the response stays fast even as the historical list grows.
 */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Math.min(Math.max(1, limitRaw || DEFAULT_LIMIT), MAX_LIMIT);

  const [payments, registrations] = await Promise.all([
    db.payment.findMany({
      where: { status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        user: { select: { name: true, email: true } },
      },
    }),
    db.workshopRegistration.findMany({
      where: { paymentStatus: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { name: true, email: true } },
        workshop: { select: { title: true, price: true } },
      },
    }),
  ]);

  // Shape into a unified timeline entry type.
  type Entry = {
    kind: "payment" | "workshop";
    id: string;
    userName: string | null;
    userEmail: string;
    productLabel: string;
    amountIls: number;
    at: string;
  };

  const entries: Entry[] = [
    ...payments.map((p): Entry => ({
      kind: "payment",
      id: p.id,
      userName: p.user.name,
      userEmail: p.user.email,
      productLabel: p.type === "PUNCH_CARD" ? "כרטיסיית 10 שיעורים" : "שיעור בודד",
      amountIls: p.amount / 100,
      at: p.updatedAt.toISOString(),
    })),
    ...registrations.map((r): Entry => ({
      kind: "workshop",
      id: r.id,
      userName: r.user.name,
      userEmail: r.user.email,
      productLabel: `סדנה: ${r.workshop.title}`,
      amountIls: r.workshop.price,
      at: r.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // After merging, cap at `limit` combined — avoids returning 2*limit entries.
  return NextResponse.json({ entries: entries.slice(0, limit) });
}
