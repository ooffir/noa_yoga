import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, reminderEmail } from "@/lib/email";
import { addHours, startOfDay, endOfDay } from "date-fns";
import { formatDate, formatTime } from "@/lib/utils";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tomorrow = addHours(new Date(), 24);
    const dayStart = startOfDay(tomorrow);
    const dayEnd = endOfDay(tomorrow);

    const bookings = await db.booking.findMany({
      where: {
        status: "CONFIRMED",
        classInstance: {
          date: { gte: dayStart, lte: dayEnd },
          isCancelled: false,
        },
      },
      include: {
        user: true,
        classInstance: { include: { classDefinition: true } },
      },
    });

    let sent = 0;
    for (const booking of bookings) {
      const ci = booking.classInstance;
      const email = reminderEmail(
        booking.user.name || "Student",
        ci.classDefinition.title,
        formatDate(ci.date),
        formatTime(ci.startTime)
      );

      await sendEmail({
        to: booking.user.email,
        subject: email.subject,
        html: email.html,
      });
      sent++;
    }

    return NextResponse.json({ sent });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send reminders" },
      { status: 500 }
    );
  }
}
