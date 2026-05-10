import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { dbErrorResponse } from "@/lib/db-errors";

export async function GET() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const workshops = await db.workshop.findMany({
      orderBy: { date: "desc" },
      include: {
        registrations: {
          where: { paymentStatus: { not: "CANCELLED" } },
          select: { quantity: true },
        },
      },
    });

    // Compute tickets sold (SUM of quantity) per workshop. This is the
    // seats-taken number the admin actually cares about — counting rows
    // would under-count buyers with quantity > 1.
    const payload = workshops.map((w) => ({
      ...w,
      ticketsSold: w.registrations.reduce((s, r) => s + r.quantity, 0),
      // Don't leak the raw registrations array — it's only used for the
      // sum and the admin list doesn't need per-row detail here.
      registrations: undefined,
    }));

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[admin/workshops GET] failed:", err);
    const { message, status } = dbErrorResponse(err, "שגיאה");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const {
      title,
      description,
      date,
      price,
      imageUrl,
      maxCapacity,
      reminderEmailContent,
      reminderTimingHours,
    } = await req.json();

    if (!title || !description || !date || price == null) {
      return NextResponse.json(
        { error: "כל השדות נדרשים" },
        { status: 400 },
      );
    }

    const workshop = await db.workshop.create({
      data: {
        title,
        description,
        date: new Date(date),
        price: Number(price),
        imageUrl: imageUrl || null,
        maxCapacity: maxCapacity ? Number(maxCapacity) : null,
        // Reminder config — both nullable. Empty string from the form
        // is normalised to null so the cron query stays simple.
        reminderEmailContent:
          typeof reminderEmailContent === "string" && reminderEmailContent.trim()
            ? reminderEmailContent
            : null,
        reminderTimingHours:
          reminderTimingHours != null && reminderTimingHours !== ""
            ? Math.max(0, Number(reminderTimingHours))
            : null,
      },
    });

    revalidatePath("/workshops");
    return NextResponse.json(workshop, { status: 201 });
  } catch (err) {
    console.error("[admin/workshops POST] failed:", err);
    const { message, status } = dbErrorResponse(err, "יצירת סדנה נכשלה");
    return NextResponse.json({ error: message }, { status });
  }
}
