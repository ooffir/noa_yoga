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
    db.payment.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
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
          where: { date: { gte: monthStart, lte: monthEnd } },
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
  const monthlyRevenue = take<{ _sum: { amount: number | null } }>(
    3,
    "monthlyRevenue",
    { _sum: { amount: 0 } },
  );
  const weeklyBookings = take<number>(4, "weeklyBookings", 0);
  const popularClasses = take<
    Array<{
      id: string;
      title: string;
      instructor: string;
      instances: Array<{ _count: { bookings: number } }>;
    }>
  >(5, "popularClasses", []);

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

  const partialFailure = settled.some((r) => r.status === "rejected");

  return NextResponse.json({
    totalStudents,
    activeStudents,
    inactiveStudents,
    activePunchCards,
    monthlyRevenue: monthlyRevenue?._sum?.amount ?? 0,
    weeklyBookings,
    popularClasses: classPopularity,
    partialFailure,
  });
}
