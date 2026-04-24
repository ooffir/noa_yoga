import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

/**
 * GET /api/admin/users/[id]/history
 *
 * Admin drill-down: full booking + punch-card history for one student.
 * Returns everything the admin needs to answer "what happened with
 * this user?" in a single round-trip:
 *
 *   - user: basic identity + current direct credits
 *   - upcoming: CONFIRMED bookings dated >= today
 *   - past: all bookings dated < today (CONFIRMED/CANCELLED/NO_SHOW)
 *   - punchCards: every card, any status, ordered by recency
 *
 * Keeps the last 50 past bookings to bound the payload — admins who
 * need more can filter in the date range on the main analytics page.
 */

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }

    const now = new Date();

    const [user, upcoming, past, punchCards] = await Promise.all([
      db.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          credits: true,
          role: true,
          createdAt: true,
          receiveEmails: true,
        },
      }),
      db.booking.findMany({
        where: {
          userId: id,
          status: "CONFIRMED",
          classInstance: { date: { gte: now } },
        },
        include: {
          classInstance: {
            include: { classDefinition: { select: { title: true, instructor: true } } },
          },
        },
        orderBy: { classInstance: { date: "asc" } },
        take: 50,
      }),
      db.booking.findMany({
        where: {
          userId: id,
          classInstance: { date: { lt: now } },
        },
        include: {
          classInstance: {
            include: { classDefinition: { select: { title: true, instructor: true } } },
          },
        },
        orderBy: { classInstance: { date: "desc" } },
        take: 50,
      }),
      db.punchCard.findMany({
        where: { userId: id },
        orderBy: { purchasedAt: "desc" },
        take: 20,
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Shape for the UI — flatten the class_instance → class_definition chain
    // so the client doesn't have to crawl nested nulls.
    const shape = (b: (typeof upcoming)[number]) => ({
      id: b.id,
      status: b.status,
      bookedAt: b.bookedAt,
      cancelledAt: b.cancelledAt,
      attendedAt: b.attendedAt,
      creditRefunded: b.creditRefunded,
      classTitle: b.classInstance.classDefinition.title,
      instructor: b.classInstance.classDefinition.instructor,
      date: b.classInstance.date,
      startTime: b.classInstance.startTime,
    });

    const activePunchCardCredits = punchCards
      .filter((pc) => pc.status === "ACTIVE")
      .reduce((sum, pc) => sum + pc.remainingCredits, 0);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
        directCredits: user.credits,
        punchCardCredits: activePunchCardCredits,
        totalCredits: user.credits + activePunchCardCredits,
        receiveEmails: user.receiveEmails,
      },
      upcoming: upcoming.map(shape),
      past: past.map(shape),
      punchCards: punchCards.map((pc) => ({
        id: pc.id,
        totalCredits: pc.totalCredits,
        remainingCredits: pc.remainingCredits,
        status: pc.status,
        purchasedAt: pc.purchasedAt,
      })),
      summary: {
        upcomingCount: upcoming.length,
        pastCount: past.length,
        attendedCount: past.filter((b) => b.attendedAt !== null).length,
        cancelledCount: past.filter((b) => b.status === "CANCELLED").length,
      },
    });
  } catch (err) {
    console.error("[admin/users/history] failed:", err);
    return NextResponse.json({ error: "failed to load history" }, { status: 500 });
  }
}
