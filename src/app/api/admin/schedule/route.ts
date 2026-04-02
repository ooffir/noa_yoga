import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import {
  getAdminWeeklySchedule,
  generateRecurringInstances,
  generateSingleInstance,
} from "@/lib/schedule-service";
import { classDefinitionSchema } from "@/lib/validations";
import { startOfWeek, addWeeks } from "date-fns";

export async function GET(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const weekOffset = parseInt(searchParams.get("week") || "0");
    const weekStart = addWeeks(
      startOfWeek(new Date(), { weekStartsOn: 0 }),
      weekOffset
    );

    const schedule = await getAdminWeeklySchedule(weekStart);
    return NextResponse.json(schedule);
  } catch {
    return NextResponse.json(
      { error: "Failed to load schedule" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const data = classDefinitionSchema.parse(body);

    const { date: dateStr, isRecurring, ...defData } = data;

    if (!dateStr) {
      return NextResponse.json(
        { error: "תאריך נדרש" },
        { status: 400 }
      );
    }

    const classDef = await db.classDefinition.create({
      data: { ...defData, isRecurring: isRecurring ?? true },
    });

    if (isRecurring) {
      await generateRecurringInstances(classDef.id, dateStr, 12);
    } else {
      await generateSingleInstance(classDef.id, dateStr);
    }

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");
    return NextResponse.json(classDef, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "שגיאת אימות", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Failed to create class:", error);
    return NextResponse.json(
      { error: "יצירת השיעור נכשלה" },
      { status: 500 }
    );
  }
}
