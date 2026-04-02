import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await db.user.findMany({
      where: { role: "STUDENT" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credits: true,
        createdAt: true,
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
        punchCards: {
          where: { status: "ACTIVE" },
          select: { remainingCredits: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        credits: u.credits + u.punchCards.reduce((s, pc) => s + pc.remainingCredits, 0),
        directCredits: u.credits,
        punchCardCredits: u.punchCards.reduce((s, pc) => s + pc.remainingCredits, 0),
        totalBookings: u._count.bookings,
        createdAt: u.createdAt,
      }))
    );
  } catch {
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, credits } = await req.json();
    if (!userId || typeof credits !== "number") {
      return NextResponse.json({ error: "נתונים חסרים" }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { credits },
    });

    return NextResponse.json({ id: updated.id, credits: updated.credits });
  } catch {
    return NextResponse.json({ error: "עדכון נכשל" }, { status: 500 });
  }
}
