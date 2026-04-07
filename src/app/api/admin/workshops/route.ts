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

    const workshops = await db.workshop.findMany({
      orderBy: { date: "desc" },
      include: { _count: { select: { registrations: true } } },
    });

    return NextResponse.json(workshops);
  } catch {
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, description, date, price, imageUrl, maxCapacity } = await req.json();

    if (!title || !description || !date || price == null) {
      return NextResponse.json({ error: "כל השדות נדרשים" }, { status: 400 });
    }

    const workshop = await db.workshop.create({
      data: {
        title,
        description,
        date: new Date(date),
        price: Number(price),
        imageUrl: imageUrl || null,
        maxCapacity: maxCapacity ? Number(maxCapacity) : null,
      },
    });

    revalidatePath("/workshops");
    return NextResponse.json(workshop, { status: 201 });
  } catch {
    return NextResponse.json({ error: "יצירת סדנה נכשלה" }, { status: 500 });
  }
}
