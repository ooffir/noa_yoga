import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

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
      activePunchCards,
      monthlyRevenue,
      weeklyBookings,
      popularClasses,
    ] = await Promise.all([
      db.user.count({ where: { role: "STUDENT" } }),
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

    return NextResponse.json({
      totalStudents,
      activePunchCards,
      monthlyRevenue: monthlyRevenue._sum.amount || 0,
      weeklyBookings,
      popularClasses: classPopularity,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
