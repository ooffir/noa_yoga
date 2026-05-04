import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

/**
 * Admin dashboard payload.
 *
 * Student activity is reported as a split:
 *   active    = users with direct credits > 0, OR at least one ACTIVE punch
 *               card with remainingCredits > 0.
 *   inactive  = all other students (role=STUDENT) — signed up but without
 *               usable credit. These are the folks to target in promos.
 *
 * The split runs as a single raw SQL because expressing "(credits > 0) OR
 * exists(active punch card)" in Prisma's .where() would require two
 * separate queries + merge; $queryRaw is cleaner and stays in the DB.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // ── Auth check with explicit diagnostic logging ──
  let dbUser;
  try {
    dbUser = await getDbUser();
  } catch (err) {
    console.error("[dashboard] getDbUser threw:", err);
    return NextResponse.json(
      { error: "auth resolution failed" },
      { status: 500 },
    );
  }

  if (!dbUser) {
    console.error(
      "[dashboard] no Clerk session — request had no auth context",
    );
    return NextResponse.json(
      { error: "unauthorized — please sign in" },
      { status: 401 },
    );
  }
  if (dbUser.role !== "ADMIN") {
    console.error("[dashboard] user is not admin", {
      userId: dbUser.id,
      role: dbUser.role,
    });
    return NextResponse.json(
      { error: "forbidden — admin role required" },
      { status: 403 },
    );
  }

  // ── Resilient aggregation ──
  // Every metric runs independently via Promise.allSettled so a single
  // failed query (e.g. transient DB blip during a Supabase pooler reset)
  // doesn't 500 the entire dashboard. Failed queries fall back to safe
  // defaults (0, [], etc.) and a `partialFailure: true` flag is set on
  // the response so the UI can show a subtle warning if needed.
  //
  // No DB writes here — purely read-only metrics.
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 });

  const settled = await Promise.allSettled([
    db.user.count({ where: { role: "STUDENT" } }),
    db.$queryRaw<Array<{ active_count: bigint; inactive_count: bigint }>>(
      Prisma.sql`
        SELECT
          COUNT(*) FILTER (
            WHERE u.credits > 0
              OR EXISTS (
                SELECT 1 FROM punch_cards pc
                WHERE pc.user_id = u.id
                  AND pc.status = 'ACTIVE'
                  AND pc.remaining_credits > 0
              )
          )::bigint AS active_count,
          COUNT(*) FILTER (
            WHERE u.credits = 0
              AND NOT EXISTS (
                SELECT 1 FROM punch_cards pc
                WHERE pc.user_id = u.id
                  AND pc.status = 'ACTIVE'
                  AND pc.remaining_credits > 0
              )
          )::bigint AS inactive_count
        FROM users u
        WHERE u.role = 'STUDENT'::user_role
      `,
    ),
    db.punchCard.count({ where: { status: "ACTIVE" } }),
    // Credit / punch-card revenue grouped by product type. Each row in
    // the result has { type, _sum: { amount }, _count }. The shape lets
    // us compute SINGLE_CLASS / PUNCH_CARD_5 / PUNCH_CARD splits in one
    // query rather than three. Payment.amount is stored in agurot.
    db.payment.groupBy({
      by: ["type"],
      where: {
        status: "COMPLETED",
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // Workshop revenue. Workshop.price is stored in shekels (NOT
    // agurot — that's a historical inconsistency we're not changing
    // now). Multiply by 100 below to align units with Payment.amount.
    //
    // Aggregating across the JOIN with raw SQL because Prisma's
    // .aggregate() doesn't support summing a field on a related row.
    db.$queryRaw<
      Array<{ workshop_revenue_agurot: bigint; workshop_count: bigint }>
    >(
      Prisma.sql`
        SELECT
          COALESCE(SUM(w.price), 0)::bigint * 100 AS workshop_revenue_agurot,
          COUNT(*)::bigint AS workshop_count
        FROM workshop_registrations wr
        JOIN workshops w ON w.id = wr.workshop_id
        WHERE wr.payment_status = 'COMPLETED'
          AND wr.created_at >= ${monthStart}
          AND wr.created_at <= ${monthEnd}
      `,
    ),
    db.booking.count({
      where: {
        status: "CONFIRMED",
        classInstance: { date: { gte: weekStart, lte: weekEnd } },
      },
    }),
    db.classDefinition.findMany({
      where: { isActive: true },
      include: {
        instances: {
          include: {
            _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
          },
          where: {
            date: { gte: monthStart, lte: monthEnd },
            // Defensive: cancelled instances already have 0 confirmed
            // bookings (the cancellation cascade flips them to CANCELLED),
            // so they can't inflate the popularity count anyway. But
            // explicitly excluding them here keeps the intent obvious in
            // the query and protects against future schema changes.
            isCancelled: false,
          },
        },
      },
    }),
  ]);

  // Helper to extract value or default. Logs each failure for diagnostics.
  function take<T>(idx: number, label: string, fallback: T): T {
    const r = settled[idx];
    if (r.status === "fulfilled") return r.value as T;
    console.error(`[dashboard] '${label}' failed:`, r.reason);
    return fallback;
  }

  const totalStudents = take<number>(0, "totalStudents", 0);
  const activeStudentsRow = take<Array<{ active_count: bigint; inactive_count: bigint }>>(
    1,
    "activeStudentsRow",
    [],
  );
  const activePunchCards = take<number>(2, "activePunchCards", 0);
  const creditRevenueGrouped = take<
    Array<{
      type: string;
      _sum: { amount: number | null };
      _count: { _all: number };
    }>
  >(3, "creditRevenueGrouped", []);
  const workshopRevenueRow = take<
    Array<{ workshop_revenue_agurot: bigint; workshop_count: bigint }>
  >(4, "workshopRevenue", []);
  const weeklyBookings = take<number>(5, "weeklyBookings", 0);
  const popularClasses = take<
    Array<{
      id: string;
      title: string;
      instructor: string;
      instances: Array<{ _count: { bookings: number } }>;
    }>
  >(6, "popularClasses", []);

  // Optional-chain `_count.bookings` defensively — even though Prisma
  // always populates _count, a future refactor could break this and
  // the dashboard shouldn't 500 over a missing aggregate.
  const classPopularity = popularClasses
    .map((c) => ({
      id: c.id,
      title: c.title,
      instructor: c.instructor,
      totalBookings: (c.instances ?? []).reduce(
        (sum, inst) => sum + (inst?._count?.bookings ?? 0),
        0,
      ),
    }))
    .sort((a, b) => b.totalBookings - a.totalBookings)
    .slice(0, 5);

  const activeStudents = Number(activeStudentsRow[0]?.active_count ?? 0);
  const inactiveStudents = Number(activeStudentsRow[0]?.inactive_count ?? 0);

  // ── Per-product revenue + sales count ──
  // Helper that pulls one product type out of the grouped result.
  function getProductStats(productType: string) {
    const row = creditRevenueGrouped.find((r) => r.type === productType);
    return {
      revenueAgurot: row?._sum.amount ?? 0,
      salesCount: row?._count._all ?? 0,
    };
  }

  const singleClass = getProductStats("SINGLE_CLASS");
  const punchCard5 = getProductStats("PUNCH_CARD_5");
  const punchCard10 = getProductStats("PUNCH_CARD");

  const workshopStats = {
    revenueAgurot: Number(workshopRevenueRow[0]?.workshop_revenue_agurot ?? 0),
    salesCount: Number(workshopRevenueRow[0]?.workshop_count ?? 0),
  };

  // Combined monthly total. All four values are agurot — the UI divides
  // by 100 to render ₪.
  const monthlyRevenue =
    singleClass.revenueAgurot +
    punchCard5.revenueAgurot +
    punchCard10.revenueAgurot +
    workshopStats.revenueAgurot;

  // Aggregate credit revenue for backward compatibility. The dashboard
  // view's optional `revenueBreakdown.credits` aggregate is still useful
  // for the simple sublabel; product-level detail goes in `productRevenue`.
  const creditRevenueAgurot =
    singleClass.revenueAgurot +
    punchCard5.revenueAgurot +
    punchCard10.revenueAgurot;

  const partialFailure = settled.some((r) => r.status === "rejected");

  return NextResponse.json({
    totalStudents,
    activeStudents,
    inactiveStudents,
    activePunchCards,
    // monthlyRevenue is the sum of credit/punch-card sales AND workshop
    // registrations for the current month. Stored in agurot — the UI is
    // responsible for converting to ₪ before rendering.
    monthlyRevenue,
    revenueBreakdown: {
      credits: creditRevenueAgurot,
      workshops: workshopStats.revenueAgurot,
    },
    // ── New: Per-product breakdown for the analytics tab ──
    // Each entry: { revenueAgurot, salesCount }.
    // The frontend uses this for the four-card breakdown + the filter
    // pill that lets Noa drill down into a single product type.
    productRevenue: {
      SINGLE_CLASS: singleClass,
      PUNCH_CARD_5: punchCard5,
      PUNCH_CARD: punchCard10,
      WORKSHOP: workshopStats,
    },
    weeklyBookings,
    popularClasses: classPopularity,
    partialFailure,
  });
}
