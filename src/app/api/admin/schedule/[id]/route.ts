import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { classDefinitionSchema } from "@/lib/validations";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const def = await db.classDefinition.findUnique({
      where: { id },
      include: {
        instances: {
          where: { isCancelled: false, date: { gte: new Date() } },
          orderBy: { date: "asc" },
          take: 1,
        },
      },
    });

    if (!def) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(def);
  } catch {
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}

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
    const body = await req.json();
    const data = classDefinitionSchema.parse(body);
    const { date: _date, isRecurring: _isRecurring, ...defData } = data;

    const updated = await db.classDefinition.update({
      where: { id },
      data: defData,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db.classInstance.updateMany({
      where: {
        classDefId: id,
        date: { gte: today },
        isCancelled: false,
      },
      data: {
        startTime: defData.startTime,
        endTime: defData.endTime,
        maxCapacity: defData.maxCapacity,
      },
    });

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "שגיאת אימות", details: error.errors },
        { status: 400 }
      );
    }
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

    await db.classDefinition.update({
      where: { id },
      data: { isActive: false },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db.classInstance.updateMany({
      where: {
        classDefId: id,
        date: { gte: today },
      },
      data: { isCancelled: true },
    });

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");
    return NextResponse.json({ message: "השיעור הושבת" });
  } catch {
    return NextResponse.json({ error: "מחיקה נכשלה" }, { status: 500 });
  }
}
