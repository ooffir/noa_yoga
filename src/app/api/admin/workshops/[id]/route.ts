import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { title, description, date, price, imageUrl, maxCapacity } = await req.json();

    const workshop = await db.workshop.update({
      where: { id },
      data: {
        title,
        description,
        date: date ? new Date(date) : undefined,
        price: price != null ? Number(price) : undefined,
        imageUrl: imageUrl || null,
        maxCapacity: maxCapacity ? Number(maxCapacity) : null,
      },
    });

    revalidatePath("/workshops");
    return NextResponse.json(workshop);
  } catch {
    return NextResponse.json({ error: "עדכון נכשל" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await db.workshop.update({ where: { id }, data: { isActive: false } });

    revalidatePath("/workshops");
    return NextResponse.json({ deactivated: true });
  } catch {
    return NextResponse.json({ error: "מחיקה נכשלה" }, { status: 500 });
  }
}
