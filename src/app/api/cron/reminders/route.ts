import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMarketingEmail, reminderEmail } from "@/lib/email";
import { addHours, startOfDay, endOfDay } from "date-fns";

/**
 * Daily cron — 09:00. Emails students with bookings 24h from now.
 *
 * Reminders are considered "marketing" in our opt-in model: they respect
 * `user.receiveEmails`. Students who opted out won't be reminded.
 */
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
    let skipped = 0;
    for (const booking of bookings) {
      const ci = booking.classInstance;
      const [hh, mm] = ci.startTime.split(":").map(Number);
      const classDateTime = new Date(ci.date);
      classDateTime.setHours(hh, mm, 0, 0);

      const { subject, html } = reminderEmail({
        name: booking.user.name || "תלמידה יקרה",
        className: ci.classDefinition.title,
        date: classDateTime,
        startTime: ci.startTime,
      });

      if (booking.user.receiveEmails) {
        await sendMarketingEmail(
          { email: booking.user.email, receiveEmails: booking.user.receiveEmails },
          { subject, html },
        );
        sent++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({ sent, skipped, total: bookings.length });
  } catch (error) {
    console.error("[cron/reminders] failed:", error);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
