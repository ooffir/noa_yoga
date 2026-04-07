import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const cards = await db.featureCard.findMany({ orderBy: { order: "asc" } });
    return NextResponse.json(cards);
  } catch {
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { cards } = await req.json() as {
      cards: { id?: string; title: string; description: string; iconName: string; order: number }[];
    };

    if (!Array.isArray(cards)) {
      return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
    }

    await db.featureCard.deleteMany({});

    if (cards.length > 0) {
      await db.featureCard.createMany({
        data: cards.map((c, i) => ({
          title: c.title.slice(0, 30),
          description: c.description.slice(0, 120),
          iconName: c.iconName || "Heart",
          order: i,
        })),
      });
    }

    revalidatePath("/");
    revalidatePath("/admin/settings");
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "שמירה נכשלה" }, { status: 500 });
  }
}
