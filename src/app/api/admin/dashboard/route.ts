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
export async function GET() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 0 });

    const [
      totalStudents,
      activeStudentsRow,
      activePunchCards,
      monthlyRevenue,
      weeklyBookings,
      popularClasses,
    ] = await Promise.all([
      db.user.count({ where: { role: "STUDENT" } }),

      // One query returns both numbers so the card never flickers with
      // partial state and totals always add up.
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

    const classPopularity = popularClasses
      .map((c) => ({
        id: c.id,
        title: c.title,
        instructor: c.instructor,
        totalBookings: c.instances.reduce(
          (sum, inst) => sum + inst._count.bookings,
          0
        ),
      }))
      .sort((a, b) => b.totalBookings - a.totalBookings)
      .slice(0, 5);

    const activeStudents = Number(activeStudentsRow[0]?.active_count ?? 0);
    const inactiveStudents = Number(activeStudentsRow[0]?.inactive_count ?? 0);

    return NextResponse.json({
      totalStudents,
      activeStudents,
      inactiveStudents,
      activePunchCards,
      monthlyRevenue: monthlyRevenue._sum.amount || 0,
      weeklyBookings,
      popularClasses: classPopularity,
    });
  } catch (error) {
    console.error("[admin/dashboard] failed:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
