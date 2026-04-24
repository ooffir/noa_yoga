import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { classDefinitionSchema } from "@/lib/validations";
import { BookingEngine } from "@/lib/booking-engine";

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

    // Deactivate the recurring definition so no more instances generate.
    await db.classDefinition.update({
      where: { id },
      data: { isActive: false },
    });

    // Cancel every future instance with the full refund cascade — we run
    // them one at a time through BookingEngine instead of a bulk updateMany
    // so each instance's booked students get their credit back AND a
    // cancellation email. `adminCancelClassInstance` is idempotent, so
    // already-cancelled instances are a safe no-op.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureInstances = await db.classInstance.findMany({
      where: {
        classDefId: id,
        date: { gte: today },
        isCancelled: false,
      },
      select: { id: true },
    });

    let totalAffected = 0;
    for (const inst of futureInstances) {
      try {
        const res = await BookingEngine.adminCancelClassInstance(
          inst.id,
          "השיעור הושבת על ידי הסטודיו",
        );
        totalAffected += res.affectedCount;
      } catch (err) {
        // One bad instance shouldn't block the rest. Log & continue.
        console.error(
          `[admin/schedule DELETE] failed on instance=${inst.id}:`,
          err,
        );
      }
    }

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");
    return NextResponse.json({
      message: "השיעור הושבת",
      instancesCancelled: futureInstances.length,
      bookingsRefunded: totalAffected,
    });
  } catch (err) {
    console.error("[admin/schedule DELETE] outer failure:", err);
    return NextResponse.json({ error: "מחיקה נכשלה" }, { status: 500 });
  }
}
