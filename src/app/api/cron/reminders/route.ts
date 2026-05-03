import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  sendMarketingEmail,
  reminderEmail,
  workshopReminderEmail,
} from "@/lib/email";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { getEmailDispatchConfig } from "@/lib/site-settings";

/**
 * Daily reminder cron.
 *
 * Schedule: fires once per day at 07:00 UTC (~09:00-10:00 Israel,
 * depending on DST). Defined in vercel.json.
 *
 * Two independent loops run in this handler:
 *
 *   1. CLASS REMINDERS — every CONFIRMED booking whose class falls on
 *      `now + reminderDaysBefore` (set in SiteSettings) gets an email.
 *
 *   2. WORKSHOP REMINDERS — every COMPLETED workshop registration
 *      whose workshop is `<= reminderTimingHours` away from now (and
 *      `> 0` away — i.e. still in the future) gets an email. Workshop
 *      reminders are gated by Workshop.reminderSentAt so each workshop
 *      sends at most once. The admin can override the message body
 *      per workshop via Workshop.reminderEmailContent.
 *
 * Why both in one cron rather than two?
 *   The Hobby plan on Vercel allows only one cron invocation per day
 *   per schedule. Splitting them would require two daily slots which
 *   we can't schedule at the right offset — easier to fold both loops
 *   into the same handler.
 *
 * Failure isolation: each individual reminder send is wrapped so that
 * a failed send (bounced address, SMTP hiccup) doesn't block the rest
 * of the batch. The handler returns 200 with per-loop counts even if
 * some sends failed.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getEmailDispatchConfig();
    const now = new Date();

    // ════════════════════════════════════════════════════════════════
    //  LOOP 1 — Class reminders
    // ════════════════════════════════════════════════════════════════
    const targetDay = addDays(now, config.reminderDaysBefore);
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

    let classSent = 0;
    let classSkipped = 0;
    let classFailed = 0;
    for (const booking of bookings) {
      try {
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
          classSent++;
        } else {
          classSkipped++;
        }
      } catch (err) {
        classFailed++;
        console.error(
          `[cron/reminders] class reminder failed for booking ${booking.id}:`,
          err,
        );
      }
    }

    // ════════════════════════════════════════════════════════════════
    //  LOOP 2 — Workshop reminders
    //
    //  A workshop is "due" for its reminder when:
    //    - It's still upcoming (date > now)
    //    - reminderTimingHours is set (otherwise no reminder for it)
    //    - now >= date - reminderTimingHours hours
    //    - reminderSentAt IS NULL (idempotency)
    //
    //  Done as a Prisma query rather than raw SQL so the relation
    //  fetching stays clean. We over-fetch a bit (any workshop with
    //  the timing field set) and filter the timing window in JS — the
    //  table is tiny (dozens of workshops, not thousands).
    // ════════════════════════════════════════════════════════════════
    const workshopCandidates = await db.workshop.findMany({
      where: {
        isActive: true,
        date: { gt: now },
        reminderTimingHours: { not: null },
        reminderSentAt: null,
      },
      include: {
        registrations: {
          where: { paymentStatus: "COMPLETED" },
          include: {
            user: {
              select: {
                email: true,
                name: true,
                receiveEmails: true,
              },
            },
          },
        },
      },
    });

    let workshopReminderSent = 0;
    let workshopReminderSkipped = 0;
    let workshopReminderFailed = 0;
    let workshopsProcessed = 0;

    for (const w of workshopCandidates) {
      // Re-check the timing window now (in case the cron is running
      // earlier or later than usual).
      const timingMs = (w.reminderTimingHours ?? 0) * 60 * 60 * 1000;
      const dueAt = new Date(w.date.getTime() - timingMs);
      if (now < dueAt) continue; // not yet within the window — leave for tomorrow's run

      workshopsProcessed++;
      let anyAttempted = false;

      for (const reg of w.registrations) {
        anyAttempted = true;
        try {
          if (!reg.user.receiveEmails) {
            workshopReminderSkipped++;
            continue;
          }

          const { subject, html } = workshopReminderEmail({
            name: reg.user.name || "תלמידה יקרה",
            workshopTitle: w.title,
            workshopDate: w.date,
            customBody: w.reminderEmailContent,
          });

          await sendMarketingEmail(
            { email: reg.user.email, receiveEmails: reg.user.receiveEmails },
            { subject, html },
          );
          workshopReminderSent++;
        } catch (err) {
          workshopReminderFailed++;
          console.error(
            `[cron/reminders] workshop reminder failed for registration ${reg.id}:`,
            err,
          );
        }
      }

      // Mark the workshop as sent regardless of whether individual
      // recipients failed — we don't want the next cron run to spam
      // the recipients who DID succeed. Failed sends are logged above
      // for manual follow-up by Noa.
      //
      // If there were zero registrations (unlikely but possible),
      // still mark sent so we don't keep re-querying it forever.
      try {
        await db.workshop.update({
          where: { id: w.id },
          data: { reminderSentAt: now },
        });
      } catch (err) {
        console.error(
          `[cron/reminders] failed to mark workshop ${w.id} as reminded:`,
          err,
        );
      }

      if (!anyAttempted) {
        // Silently OK — workshop is marked sent. This typically means
        // nobody had paid yet at the time of the reminder window.
      }
    }

    return NextResponse.json({
      classes: {
        sent: classSent,
        skipped: classSkipped,
        failed: classFailed,
        total: bookings.length,
        daysBefore: config.reminderDaysBefore,
      },
      workshops: {
        candidatesFound: workshopCandidates.length,
        processed: workshopsProcessed,
        sent: workshopReminderSent,
        skipped: workshopReminderSkipped,
        failed: workshopReminderFailed,
      },
    });
  } catch (error) {
    console.error("[cron/reminders] failed:", error);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
