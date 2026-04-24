import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMarketingEmail, reminderEmail } from "@/lib/email";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { getEmailDispatchConfig } from "@/lib/site-settings";

/**
 * Daily reminder cron.
 *
 * Schedule: fires once per day at 07:00 UTC (~09:00-10:00 Israel,
 * depending on DST). Defined in vercel.json.
 *
 * Why not hourly with an in-handler gate on `reminderHour`?
 *   The Hobby plan on Vercel allows only one cron invocation per day
 *   per schedule — hourly expressions (`0 * * * *`) fail the entire
 *   deploy. So the cron fires once, unconditionally, and we read
 *   `reminderDaysBefore` from SiteSettings to decide which day's
 *   bookings to target.
 *
 * `reminderHour` in SiteSettings is retained for future use (if Noa
 * upgrades to Vercel Pro we can restore the hourly gated pattern) but
 * currently has no runtime effect — the cron always runs at the
 * vercel.json time regardless of that setting.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getEmailDispatchConfig();

    // ── Window: the day `reminderDaysBefore` from now, local midnight→11:59PM ──
    const targetDay = addDays(new Date(), config.reminderDaysBefore);
    const dayStart = startOfDay(targetDay);
    const dayEnd = endOfDay(targetDay);

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
        overrideTemplate: config.emailTemplateReminder,
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

    return NextResponse.json({
      sent,
      skipped,
      total: bookings.length,
      daysBefore: config.reminderDaysBefore,
    });
  } catch (error) {
    console.error("[cron/reminders] failed:", error);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
