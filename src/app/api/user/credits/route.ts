import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = dbUser.id;

    const punchCards = await db.punchCard.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { purchasedAt: "asc" },
    });

    const totalCredits = punchCards.reduce(
      (sum, pc) => sum + pc.remainingCredits,
      0
    );

    return NextResponse.json({
      totalCredits,
      punchCards: punchCards.map((pc) => ({
        id: pc.id,
        totalCredits: pc.totalCredits,
        remainingCredits: pc.remainingCredits,
        purchasedAt: pc.purchasedAt,
        expiresAt: pc.expiresAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
