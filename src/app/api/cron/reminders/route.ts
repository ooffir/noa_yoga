import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMarketingEmail, reminderEmail } from "@/lib/email";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { getEmailDispatchConfig } from "@/lib/site-settings";

/**
 * Hourly cron — "should I send reminders right now?"
 *
 * Vercel cron runs this every hour (see vercel.json). Inside the handler:
 *   1. Read `reminderHour` + `reminderDaysBefore` from SiteSettings.
 *   2. If Jerusalem-time hour ≠ reminderHour → return 204 no-op.
 *   3. Otherwise query bookings for classes N days from now and dispatch
 *      using the admin-editable reminder template.
 *
 * Why hourly instead of a fixed 09:00 schedule?
 *   The admin can change `reminderHour` from the dashboard; with a fixed
 *   Vercel cron, a UI change would only take effect on the next deploy.
 *   An hourly cron that gates internally is the simplest way to honour the
 *   admin's choice without asking them to edit vercel.json.
 *
 * Why Jerusalem time?
 *   The studio operates in Israel; the admin's UI input represents local
 *   time. Vercel crons run in UTC, so we compute the current hour in
 *   Asia/Jerusalem before comparing. Handles DST automatically via Intl.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getEmailDispatchConfig();

    // ── Hour-of-day gate (Asia/Jerusalem) ──
    const jerusalemHourStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    const currentHour = parseInt(jerusalemHourStr, 10);

    if (currentHour !== config.reminderHour) {
      return NextResponse.json({
        skipped: true,
        reason: `current hour ${currentHour} ≠ reminderHour ${config.reminderHour}`,
      });
    }

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
      hour: currentHour,
      daysBefore: config.reminderDaysBefore,
    });
  } catch (error) {
    console.error("[cron/reminders] failed:", error);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
