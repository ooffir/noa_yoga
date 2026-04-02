import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { BookingEngine } from "@/lib/booking-engine";
import { db } from "@/lib/db";
import { bookingSchema } from "@/lib/validations";

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "יש להתחבר תחילה" }, { status: 401 });
    }

    const body = await req.json();
    const { classInstanceId } = bookingSchema.parse(body);

    const result = await BookingEngine.bookClass(dbUser.id, classInstanceId);

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");

    if (result.type === "waitlist") {
      return NextResponse.json(
        { message: "נוספת לרשימת ההמתנה", type: "waitlist", position: result.entry.position },
        { status: 200 }
      );
    }

    const instance = await db.classInstance.findUnique({
      where: { id: classInstanceId },
      include: { classDefinition: true },
    });

    return NextResponse.json(
      {
        message: "ההרשמה אושרה!",
        type: "booking",
        bookingId: result.booking.id,
        calendarEvent: instance
          ? {
              title: `נועה יוגה – ${instance.classDefinition.title}`,
              date: instance.date,
              startTime: instance.startTime,
              endTime: instance.endTime,
              location: instance.classDefinition.location || instance.location || "",
            }
          : null,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "ההרשמה נכשלה" },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "upcoming";
    const now = new Date();

    const bookings = await db.booking.findMany({
      where: {
        userId: dbUser.id,
        status: type === "past" ? undefined : "CONFIRMED",
        classInstance: type === "past" ? { date: { lt: now } } : { date: { gte: now } },
      },
      include: { classInstance: { include: { classDefinition: true } } },
      orderBy: { classInstance: { date: type === "past" ? "desc" : "asc" } },
    });

    return NextResponse.json(bookings);
  } catch {
    return NextResponse.json({ error: "שגיאה בטעינת ההזמנות" }, { status: 500 });
  }
}
