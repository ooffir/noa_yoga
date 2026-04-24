import { db } from "@/lib/db";
import {
  sendMarketingEmail,
  sendTransactionalEmail,
  waitlistPromotionEmail,
  bookingConfirmationEmail,
  classCancellationEmail,
} from "@/lib/email";
import {
  getCancellationWindowHours,
  getEmailDispatchConfig,
} from "@/lib/site-settings";

const BookingStatus = { CONFIRMED: "CONFIRMED", CANCELLED: "CANCELLED", NO_SHOW: "NO_SHOW" } as const;
const WaitlistStatus = { WAITING: "WAITING", PROMOTED: "PROMOTED", EXPIRED: "EXPIRED", CANCELLED: "CANCELLED" } as const;
const PunchCardStatus = { ACTIVE: "ACTIVE", EXHAUSTED: "EXHAUSTED", EXPIRED: "EXPIRED" } as const;

interface PromotedUserInfo {
  email: string;
  name: string | null;
  receiveEmails: boolean;
  className: string;
  classDate: Date;
  startTime: string;
}

/**
 * Fire-and-forget waitlist-promotion email dispatch.
 *
 * Always invoked AFTER the enclosing transaction commits so a broken SMTP
 * session / template can't roll back the DB promotion. Uses
 * sendMarketingEmail — respects the user's receiveEmails opt-out flag.
 *
 * `overrideTemplate` is the admin-editable body from
 * SiteSettings.emailTemplatePromotion. Empty string → built-in fallback
 * inside waitlistPromotionEmail() kicks in.
 */
function dispatchPromotionEmail(
  info: PromotedUserInfo | null,
  overrideTemplate: string | null = null,
) {
  if (!info) return;
  try {
    const { subject, html } = waitlistPromotionEmail({
      name: info.name || "תלמידה יקרה",
      className: info.className,
      date: info.classDate,
      startTime: info.startTime,
      overrideTemplate,
    });
    sendMarketingEmail(
      { email: info.email, receiveEmails: info.receiveEmails },
      { subject, html },
    ).catch((err) => {
      console.error("[booking] promotion email failed:", err?.message || err);
    });
  } catch (err) {
    console.error("[booking] promotion email build failed:", err);
  }
}

interface BookingConfirmationInfo {
  email: string;
  name: string | null;
  receiveEmails: boolean;
  className: string;
  classDate: Date;
  startTime: string;
  cancellationHours: number;
}

interface ClassCancellationInfo {
  email: string;
  name: string | null;
  /** Not consulted — cancellation emails are transactional. Kept for symmetry. */
  receiveEmails: boolean;
  className: string;
  classDate: Date;
  startTime: string;
  creditRefunded: boolean;
  reason?: string;
}

/**
 * Fire-and-forget class-cancellation email. Transactional — always sends,
 * even if the user opted out of marketing mail. Justification: the user
 * had a seat in a specific class that no longer exists, and their credit
 * balance has changed — both are operational facts they need.
 */
function dispatchClassCancellationEmail(
  info: ClassCancellationInfo,
  overrideTemplate: string | null = null,
) {
  try {
    const { subject, html } = classCancellationEmail({
      name: info.name || "תלמידה יקרה",
      className: info.className,
      date: info.classDate,
      startTime: info.startTime,
      creditRefunded: info.creditRefunded,
      reason: info.reason,
      overrideTemplate,
    });
    sendTransactionalEmail({ to: info.email, subject, html }).catch((err) => {
      console.error("[booking] cancellation email failed:", err?.message || err);
    });
  } catch (err) {
    console.error("[booking] cancellation email build failed:", err);
  }
}

/**
 * Fire-and-forget booking confirmation. Marketing email — respects opt-out.
 */
function dispatchBookingConfirmationEmail(info: BookingConfirmationInfo | null) {
  if (!info) return;
  try {
    const { subject, html } = bookingConfirmationEmail({
      name: info.name || "תלמידה יקרה",
      className: info.className,
      date: info.classDate,
      startTime: info.startTime,
      cancellationHours: info.cancellationHours,
    });
    sendMarketingEmail(
      { email: info.email, receiveEmails: info.receiveEmails },
      { subject, html },
    ).catch((err) => {
      console.error("[booking] confirmation email failed:", err?.message || err);
    });
  } catch (err) {
    console.error("[booking] confirmation email build failed:", err);
  }
}

export class BookingEngine {
  static async bookClass(userId: string, classInstanceId: string) {
    // Grab the current cancellation window BEFORE opening the tx so the email
    // reflects the current policy value that the user saw at booking time.
    const cancellationHours = await getCancellationWindowHours();

    const result = await db.$transaction(
      async (tx) => {
        const classInstance = await tx.classInstance.findUnique({
          where: { id: classInstanceId },
          include: { classDefinition: true },
        });

        if (!classInstance) throw new Error("השיעור לא נמצא");
        if (classInstance.isCancelled) throw new Error("השיעור בוטל");

        const classDate = new Date(classInstance.date);
        const [h, m] = classInstance.startTime.split(":").map(Number);
        classDate.setHours(h, m, 0, 0);
        if (classDate < new Date()) throw new Error("לא ניתן להירשם לשיעור שעבר");

        const existingBooking = await tx.booking.findUnique({
          where: { userId_classInstanceId: { userId, classInstanceId } },
        });
        if (existingBooking && existingBooking.status === BookingStatus.CONFIRMED) {
          throw new Error("את/ה כבר רשום/ה לשיעור הזה");
        }

        const existingWaitlist = await tx.waitlistEntry.findUnique({
          where: { userId_classInstanceId: { userId, classInstanceId } },
        });
        if (existingWaitlist && existingWaitlist.status === WaitlistStatus.WAITING) {
          throw new Error("את/ה כבר ברשימת ההמתנה");
        }

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("משתמש לא נמצא");

        // ── Credit guard (applies to BOTH booking and waitlist paths) ──
        // Enforces that a student cannot even JOIN a waitlist without
        // standing credit. Rationale: we auto-deduct a credit the moment
        // they're promoted; if they had zero then, we'd either silently
        // mark them EXPIRED (bad UX) or book them into negative credit
        // (financially wrong). Requiring the credit up-front avoids both.
        //
        // NB: The actual decrement happens ONLY in the "class has space"
        // branch below — waitlist entries don't consume the credit yet.
        let creditSource: "user" | "punchcard" = "user";
        let punchCardId: string | null = null;

        if (user.credits > 0) {
          creditSource = "user";
        } else {
          const punchCard = await tx.punchCard.findFirst({
            where: { userId, status: PunchCardStatus.ACTIVE, remainingCredits: { gt: 0 } },
            orderBy: { purchasedAt: "asc" },
          });

          if (punchCard) {
            creditSource = "punchcard";
            punchCardId = punchCard.id;
          } else {
            throw new Error("אין לך יתרת שיעורים. נא לעבור לרכישת קרדיטים.");
          }
        }

        const confirmedCount = await tx.booking.count({
          where: { classInstanceId, status: BookingStatus.CONFIRMED },
        });

        if (confirmedCount >= classInstance.maxCapacity) {
          const maxPosition = await tx.waitlistEntry.aggregate({
            where: { classInstanceId, status: WaitlistStatus.WAITING },
            _max: { position: true },
          });

          // Upsert: if this user previously joined the waitlist for this class
          // (and was EXPIRED / CANCELLED / PROMOTED), reuse the same row.
          // Without upsert, the unique index (user_id, class_instance_id)
          // would cause a constraint error on a retry.
          const entry = await tx.waitlistEntry.upsert({
            where: { userId_classInstanceId: { userId, classInstanceId } },
            create: {
              userId,
              classInstanceId,
              position: (maxPosition._max.position ?? 0) + 1,
            },
            update: {
              position: (maxPosition._max.position ?? 0) + 1,
              status: WaitlistStatus.WAITING,
              promotedAt: null,
              notifiedAt: null,
            },
          });

          return { type: "waitlist" as const, entry };
        }

        if (creditSource === "user") {
          await tx.user.update({
            where: { id: userId },
            data: { credits: { decrement: 1 } },
          });
        } else if (punchCardId) {
          const pc = await tx.punchCard.findUnique({ where: { id: punchCardId } });
          if (!pc) throw new Error("כרטיסייה לא נמצאה");
          await tx.punchCard.update({
            where: { id: punchCardId },
            data: {
              remainingCredits: { decrement: 1 },
              status: pc.remainingCredits - 1 === 0 ? PunchCardStatus.EXHAUSTED : PunchCardStatus.ACTIVE,
            },
          });
        }

        // Upsert instead of create: a prior CANCELLED booking for the same
        // (user, class) would otherwise trigger the unique-constraint error.
        const booking = await tx.booking.upsert({
          where: { userId_classInstanceId: { userId, classInstanceId } },
          create: {
            userId,
            classInstanceId,
            status: BookingStatus.CONFIRMED,
            punchCardId,
          },
          update: {
            status: BookingStatus.CONFIRMED,
            punchCardId,
            bookedAt: new Date(),
            cancelledAt: null,
            creditRefunded: false,
            attendedAt: null,
            markedBy: null,
          },
        });

        await tx.classInstance.update({
          where: { id: classInstanceId },
          data: { currentBookings: { increment: 1 } },
        });

        // Capture what the post-commit email dispatch needs. Doing the user
        // lookup inside the tx guarantees we have the right email/name
        // even if the user record is modified concurrently.
        const confirmationInfo: BookingConfirmationInfo = {
          email: user.email,
          name: user.name,
          receiveEmails: user.receiveEmails,
          className: classInstance.classDefinition.title,
          classDate: new Date(classInstance.date),
          startTime: classInstance.startTime,
          cancellationHours,
        };

        return {
          type: "booking" as const,
          booking,
          confirmationInfo,
        };
      },
      { isolationLevel: "Serializable", timeout: 10000 }
    );

    // Email fires AFTER the DB transaction commits so SMTP problems can't
    // roll back the booking. Only sent for actual bookings — waitlist
    // entries are acknowledged via toast but have no dedicated email.
    if (result.type === "booking" && "confirmationInfo" in result) {
      dispatchBookingConfirmationEmail(result.confirmationInfo);
    }

    // Strip the confirmationInfo before handing the result back to callers
    // — they don't need it and exposing it complicates their types.
    if (result.type === "booking" && "confirmationInfo" in result) {
      const { confirmationInfo: _omit, ...rest } = result;
      void _omit;
      return rest;
    }
    return result;
  }

  static async cancelBooking(userId: string, bookingId: string) {
    // Read the admin-controlled cancellation window + email templates
    // ONCE before opening the transaction — avoids holding the serializable
    // tx while we hit the site_settings table and keeps the hot path
    // predictable. Templates are only used post-commit for email dispatch.
    const [cancellationHours, emailConfig] = await Promise.all([
      getCancellationWindowHours(),
      getEmailDispatchConfig(),
    ]);

    const { refunded, promotedUser } = await db.$transaction(
      async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            classInstance: { include: { classDefinition: true } },
            punchCard: true,
          },
        });

        if (!booking) throw new Error("ההזמנה לא נמצאה");
        if (booking.userId !== userId) throw new Error("אין הרשאה");
        if (booking.status !== BookingStatus.CONFIRMED) throw new Error("ההזמנה לא פעילה");

        const [hours, minutes] = booking.classInstance.startTime.split(":").map(Number);
        const classDateTime = new Date(booking.classInstance.date);
        classDateTime.setHours(hours, minutes, 0, 0);
        const diffHours = (classDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
        const canRefund = diffHours >= cancellationHours;

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: new Date(),
            creditRefunded: canRefund,
          },
        });

        await tx.classInstance.update({
          where: { id: booking.classInstanceId },
          data: { currentBookings: { decrement: 1 } },
        });

        if (canRefund) {
          if (booking.punchCardId) {
            await tx.punchCard.update({
              where: { id: booking.punchCardId },
              data: {
                remainingCredits: { increment: 1 },
                status: PunchCardStatus.ACTIVE,
              },
            });
          } else {
            await tx.user.update({
              where: { id: userId },
              data: { credits: { increment: 1 } },
            });
          }
        }

        const promoted = await BookingEngine.promoteFromWaitlist(tx, booking.classInstanceId);

        const promotedUser: PromotedUserInfo | null = promoted
          ? {
              email: promoted.user.email,
              name: promoted.user.name,
              receiveEmails: promoted.user.receiveEmails,
              className: promoted.classInstance.classDefinition.title,
              classDate: new Date(promoted.classInstance.date),
              startTime: promoted.classInstance.startTime,
            }
          : null;

        return { refunded: canRefund, promotedUser };
      },
      { isolationLevel: "Serializable", timeout: 10000 }
    );

    // Email fires AFTER the DB transaction commits (failures won't roll back).
    // Uses the admin-editable waitlist promotion template from SiteSettings.
    dispatchPromotionEmail(promotedUser, emailConfig.emailTemplatePromotion);

    return { refunded };
  }

  static async promoteFromWaitlist(tx: any, classInstanceId: string): Promise<any> {
    const nextInLine = await tx.waitlistEntry.findFirst({
      where: { classInstanceId, status: WaitlistStatus.WAITING },
      orderBy: { position: "asc" },
      include: { user: true, classInstance: { include: { classDefinition: true } } },
    });

    if (!nextInLine) return null;

    const user = nextInLine.user;
    let punchCardId: string | null = null;

    if (user.credits > 0) {
      await tx.user.update({
        where: { id: user.id },
        data: { credits: { decrement: 1 } },
      });
    } else {
      const punchCard = await tx.punchCard.findFirst({
        where: { userId: user.id, status: PunchCardStatus.ACTIVE, remainingCredits: { gt: 0 } },
        orderBy: { purchasedAt: "asc" },
      });

      if (!punchCard) {
        await tx.waitlistEntry.update({
          where: { id: nextInLine.id },
          data: { status: WaitlistStatus.EXPIRED },
        });
        return BookingEngine.promoteFromWaitlist(tx, classInstanceId);
      }

      punchCardId = punchCard.id;
      await tx.punchCard.update({
        where: { id: punchCard.id },
        data: {
          remainingCredits: { decrement: 1 },
          status: punchCard.remainingCredits - 1 === 0 ? PunchCardStatus.EXHAUSTED : PunchCardStatus.ACTIVE,
        },
      });
    }

    // Upsert: if the promoted user previously had a CANCELLED booking for
    // this class, reuse that row instead of hitting the unique constraint.
    await tx.booking.upsert({
      where: { userId_classInstanceId: { userId: user.id, classInstanceId } },
      create: { userId: user.id, classInstanceId, status: BookingStatus.CONFIRMED, punchCardId },
      update: {
        status: BookingStatus.CONFIRMED,
        punchCardId,
        bookedAt: new Date(),
        cancelledAt: null,
        creditRefunded: false,
        attendedAt: null,
        markedBy: null,
      },
    });

    await tx.classInstance.update({
      where: { id: classInstanceId },
      data: { currentBookings: { increment: 1 } },
    });

    await tx.waitlistEntry.update({
      where: { id: nextInLine.id },
      data: { status: WaitlistStatus.PROMOTED, promotedAt: new Date(), notifiedAt: new Date() },
    });

    return nextInLine;
  }

  static async adminAddStudent(classInstanceId: string, userId: string) {
    return await db.$transaction(async (tx) => {
      const classInstance = await tx.classInstance.findUnique({ where: { id: classInstanceId } });
      if (!classInstance) throw new Error("השיעור לא נמצא");

      const existing = await tx.booking.findUnique({
        where: { userId_classInstanceId: { userId, classInstanceId } },
      });
      if (existing?.status === BookingStatus.CONFIRMED) throw new Error("התלמיד/ה כבר רשום/ה");

      // Upsert: a prior CANCELLED booking would otherwise cause a unique
      // constraint failure on the (user_id, class_instance_id) index.
      const booking = await tx.booking.upsert({
        where: { userId_classInstanceId: { userId, classInstanceId } },
        create: { userId, classInstanceId, status: BookingStatus.CONFIRMED },
        update: {
          status: BookingStatus.CONFIRMED,
          bookedAt: new Date(),
          cancelledAt: null,
          creditRefunded: false,
          attendedAt: null,
          markedBy: null,
          punchCardId: null,
        },
      });

      await tx.classInstance.update({
        where: { id: classInstanceId },
        data: { currentBookings: { increment: 1 } },
      });

      return booking;
    });
  }

  /**
   * Admin removes a student from a class. The student's credit is
   * refunded automatically (to whichever source — punch card or
   * direct credits — was used when they booked). The freed seat
   * is immediately offered to the next person on the waitlist.
   *
   * @param refundCredit — defaults to true; pass false for no-show
   *                      removals where the credit should be forfeited.
   */
  static async adminRemoveStudent(
    classInstanceId: string,
    userId: string,
    refundCredit: boolean = true,
  ) {
    // Templates fetched BEFORE the tx so we don't hold a serializable
    // lock over site_settings. Only used after commit for email dispatch.
    const emailConfig = await getEmailDispatchConfig();

    const { promotedUser } = await db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { userId_classInstanceId: { userId, classInstanceId } },
      });
      if (!booking || booking.status !== BookingStatus.CONFIRMED) {
        throw new Error("לא נמצאה הזמנה פעילה");
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          creditRefunded: refundCredit,
        },
      });

      await tx.classInstance.update({
        where: { id: classInstanceId },
        data: { currentBookings: { decrement: 1 } },
      });

      // Refund the credit to the original source: if the booking was
      // paid via a punch card, restore the punch card slot and reactivate
      // the card if it had been EXHAUSTED. Otherwise restore the user's
      // direct credit balance. This mirrors the student-side cancel path.
      if (refundCredit) {
        if (booking.punchCardId) {
          await tx.punchCard.update({
            where: { id: booking.punchCardId },
            data: {
              remainingCredits: { increment: 1 },
              status: PunchCardStatus.ACTIVE,
            },
          });
        } else {
          await tx.user.update({
            where: { id: userId },
            data: { credits: { increment: 1 } },
          });
        }
      }

      const promoted = await BookingEngine.promoteFromWaitlist(tx, classInstanceId);
      const promotedUser: PromotedUserInfo | null = promoted
        ? {
            email: promoted.user.email,
            name: promoted.user.name,
            receiveEmails: promoted.user.receiveEmails,
            className: promoted.classInstance.classDefinition.title,
            classDate: new Date(promoted.classInstance.date),
            startTime: promoted.classInstance.startTime,
          }
        : null;

      return { removed: true, promotedUser };
    }, { isolationLevel: "Serializable", timeout: 10_000 });

    dispatchPromotionEmail(promotedUser, emailConfig.emailTemplatePromotion);

    return { removed: true, refunded: refundCredit };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Leave waitlist — student-initiated
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Let a student voluntarily leave a waitlist they're sitting on.
   * No credit movement — joining a waitlist never costs credits.
   */
  static async leaveWaitlist(userId: string, classInstanceId: string) {
    const entry = await db.waitlistEntry.findUnique({
      where: { userId_classInstanceId: { userId, classInstanceId } },
    });
    if (!entry) throw new Error("לא נמצאה רשומה ברשימת ההמתנה");
    if (entry.status !== WaitlistStatus.WAITING) {
      throw new Error("לא ברשימת ההמתנה הפעילה");
    }

    await db.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: WaitlistStatus.CANCELLED },
    });

    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Admin: cancel a single class instance with full refund cascade
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Mark a `ClassInstance` as cancelled AND:
   *   - cancel every CONFIRMED booking
   *   - refund 1 credit to each booked student (punch card or direct)
   *   - drop all WAITING waitlist entries (nothing to be promoted to)
   *   - return the list of affected users so the caller can email them
   *
   * Runs in a Serializable transaction — if any step fails, nothing
   * changes. This is the all-or-nothing guarantee the admin needs to
   * confidently click "cancel this Tuesday's class".
   *
   * Idempotent: calling twice on the same instance is a no-op the
   * second time (already-cancelled bookings are skipped).
   */
  static async adminCancelClassInstance(
    classInstanceId: string,
    reason?: string,
  ): Promise<{
    affectedCount: number;
    notificationInfos: ClassCancellationInfo[];
  }> {
    // Fetch the admin-editable cancellation template once, before the tx.
    // Used post-commit in the email dispatch loop.
    const emailConfig = await getEmailDispatchConfig();

    const { affectedUsers, classTitle, classDate, startTime } =
      await db.$transaction(async (tx) => {
        const instance = await tx.classInstance.findUnique({
          where: { id: classInstanceId },
          include: {
            classDefinition: { select: { title: true } },
            bookings: {
              where: { status: BookingStatus.CONFIRMED },
              include: {
                user: {
                  select: { id: true, email: true, name: true, receiveEmails: true },
                },
              },
            },
            waitlistEntries: {
              where: { status: WaitlistStatus.WAITING },
              select: { id: true },
            },
          },
        });
        if (!instance) throw new Error("השיעור לא נמצא");

        await tx.classInstance.update({
          where: { id: classInstanceId },
          data: { isCancelled: true },
        });

        const affected: Array<{
          email: string;
          name: string | null;
          receiveEmails: boolean;
        }> = [];

        for (const booking of instance.bookings) {
          await tx.booking.update({
            where: { id: booking.id },
            data: {
              status: BookingStatus.CANCELLED,
              cancelledAt: new Date(),
              creditRefunded: true,
            },
          });

          if (booking.punchCardId) {
            await tx.punchCard.update({
              where: { id: booking.punchCardId },
              data: {
                remainingCredits: { increment: 1 },
                status: PunchCardStatus.ACTIVE,
              },
            });
          } else {
            await tx.user.update({
              where: { id: booking.userId },
              data: { credits: { increment: 1 } },
            });
          }

          affected.push({
            email: booking.user.email,
            name: booking.user.name,
            receiveEmails: booking.user.receiveEmails,
          });
        }

        // Clear the waitlist — no seats exist any more.
        if (instance.waitlistEntries.length > 0) {
          await tx.waitlistEntry.updateMany({
            where: {
              classInstanceId,
              status: WaitlistStatus.WAITING,
            },
            data: { status: WaitlistStatus.CANCELLED },
          });
        }

        // currentBookings gets reset so the instance is fully clean if
        // an admin un-cancels it later (not currently supported in UI).
        await tx.classInstance.update({
          where: { id: classInstanceId },
          data: { currentBookings: 0 },
        });

        return {
          affectedUsers: affected,
          classTitle: instance.classDefinition.title,
          classDate: new Date(instance.date),
          startTime: instance.startTime,
        };
      }, { isolationLevel: "Serializable", timeout: 15_000 });

    const notificationInfos: ClassCancellationInfo[] = affectedUsers.map((u) => ({
      email: u.email,
      name: u.name,
      receiveEmails: u.receiveEmails,
      className: classTitle,
      classDate,
      startTime,
      creditRefunded: true,
      reason,
    }));

    // Fire-and-forget transactional emails. Cancellation is an operational
    // notice (+ a financial change), so bypass the marketing opt-out.
    // Each email uses the admin-editable cancellation template; fallback to
    // the built-in wording if Noa hasn't customised it yet.
    for (const info of notificationInfos) {
      dispatchClassCancellationEmail(info, emailConfig.emailTemplateCancellation);
    }

    return {
      affectedCount: notificationInfos.length,
      notificationInfos,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Admin: increase capacity → auto-promote from waitlist
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Raise a class's capacity and fill the newly opened seats from the
   * waitlist (in position order). Returns the list of promoted users
   * so the caller can email them.
   *
   * Will no-op if the new capacity is ≤ current. Guarded by a
   * Serializable tx so two simultaneous admin clicks can't over-promote.
   */
  static async adminSetCapacity(
    classInstanceId: string,
    newCapacity: number,
  ): Promise<{ promotedInfos: PromotedUserInfo[] }> {
    if (newCapacity < 1) throw new Error("קיבולת חייבת להיות לפחות 1");

    // Promotion template pulled once pre-tx; fed into the dispatch loop
    // after commit. Email sends never block the DB transaction.
    const emailConfig = await getEmailDispatchConfig();

    const promotedInfos = await db.$transaction(async (tx) => {
      const instance = await tx.classInstance.findUnique({
        where: { id: classInstanceId },
      });
      if (!instance) throw new Error("השיעור לא נמצא");

      const previousCapacity = instance.maxCapacity;

      await tx.classInstance.update({
        where: { id: classInstanceId },
        data: { maxCapacity: newCapacity },
      });

      if (newCapacity <= previousCapacity) {
        return [] as PromotedUserInfo[];
      }

      // Only the delta above the previous capacity can trigger new
      // promotions — existing current-bookings fill the old slots.
      const confirmedCount = await tx.booking.count({
        where: { classInstanceId, status: BookingStatus.CONFIRMED },
      });

      const seatsAvailable = newCapacity - confirmedCount;
      if (seatsAvailable <= 0) return [] as PromotedUserInfo[];

      const infos: PromotedUserInfo[] = [];
      for (let i = 0; i < seatsAvailable; i++) {
        const promoted = await BookingEngine.promoteFromWaitlist(tx, classInstanceId);
        if (!promoted) break;
        infos.push({
          email: promoted.user.email,
          name: promoted.user.name,
          receiveEmails: promoted.user.receiveEmails,
          className: promoted.classInstance.classDefinition.title,
          classDate: new Date(promoted.classInstance.date),
          startTime: promoted.classInstance.startTime,
        });
      }
      return infos;
    }, { isolationLevel: "Serializable", timeout: 15_000 });

    // Emails after commit — failures here don't undo the promotion.
    // Uses the admin-editable waitlist-promotion template when set.
    for (const info of promotedInfos) {
      dispatchPromotionEmail(info, emailConfig.emailTemplatePromotion);
    }

    return { promotedInfos };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Admin: manually promote a specific waitlisted student
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Pull a specific student off the waitlist and into the class, even if
   * the class is already at capacity (admin override). ALWAYS deducts one
   * credit from the student — matches every other promotion path so
   * accounting stays consistent.
   *
   * Fails loudly if the student has no credits (punch card OR direct).
   * Admins should then either "add credit manually" first, or pick a
   * different student.
   *
   * Runs in a Serializable tx → atomic with the credit deduction and
   * waitlist-entry status update. Emits the standard waitlist-promotion
   * email post-commit, using the admin-editable template.
   */
  static async adminPromoteWaitlistStudent(
    classInstanceId: string,
    userId: string,
  ): Promise<{ promoted: true; overrode: boolean }> {
    const emailConfig = await getEmailDispatchConfig();

    const { promotedInfo, overrode } = await db.$transaction(async (tx) => {
      const entry = await tx.waitlistEntry.findUnique({
        where: { userId_classInstanceId: { userId, classInstanceId } },
        include: {
          user: true,
          classInstance: { include: { classDefinition: true } },
        },
      });
      if (!entry) throw new Error("הסטודנטית לא נמצאה ברשימת ההמתנה");
      if (entry.status !== WaitlistStatus.WAITING) {
        throw new Error("הסטודנטית לא ממתינה (ייתכן שכבר קודמה)");
      }

      // Capacity bypass — we'll allow 11/10 if admin insists.
      const confirmedCount = await tx.booking.count({
        where: { classInstanceId, status: BookingStatus.CONFIRMED },
      });
      const overrode = confirmedCount >= entry.classInstance.maxCapacity;

      const user = entry.user;
      let punchCardId: string | null = null;

      if (user.credits > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { credits: { decrement: 1 } },
        });
      } else {
        const pc = await tx.punchCard.findFirst({
          where: {
            userId: user.id,
            status: PunchCardStatus.ACTIVE,
            remainingCredits: { gt: 0 },
          },
          orderBy: { purchasedAt: "asc" },
        });
        if (!pc) {
          throw new Error(
            "אין לסטודנטית קרדיטים — הוסיפי קרדיטים ידנית ונסי שוב",
          );
        }
        punchCardId = pc.id;
        await tx.punchCard.update({
          where: { id: pc.id },
          data: {
            remainingCredits: { decrement: 1 },
            status: pc.remainingCredits - 1 === 0
              ? PunchCardStatus.EXHAUSTED
              : PunchCardStatus.ACTIVE,
          },
        });
      }

      // Upsert: a prior CANCELLED booking for the same (user, class)
      // would otherwise fail the unique constraint.
      await tx.booking.upsert({
        where: { userId_classInstanceId: { userId: user.id, classInstanceId } },
        create: {
          userId: user.id,
          classInstanceId,
          status: BookingStatus.CONFIRMED,
          punchCardId,
        },
        update: {
          status: BookingStatus.CONFIRMED,
          punchCardId,
          bookedAt: new Date(),
          cancelledAt: null,
          creditRefunded: false,
          attendedAt: null,
          markedBy: null,
        },
      });

      await tx.classInstance.update({
        where: { id: classInstanceId },
        data: { currentBookings: { increment: 1 } },
      });

      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: {
          status: WaitlistStatus.PROMOTED,
          promotedAt: new Date(),
          notifiedAt: new Date(),
        },
      });

      const promotedInfo: PromotedUserInfo = {
        email: user.email,
        name: user.name,
        receiveEmails: user.receiveEmails,
        className: entry.classInstance.classDefinition.title,
        classDate: new Date(entry.classInstance.date),
        startTime: entry.classInstance.startTime,
      };

      return { promotedInfo, overrode };
    }, { isolationLevel: "Serializable", timeout: 10_000 });

    // Post-commit — failure here won't undo the promotion.
    dispatchPromotionEmail(promotedInfo, emailConfig.emailTemplatePromotion);

    return { promoted: true, overrode };
  }

  static async markAttendance(bookingId: string, attended: boolean, markedBy: string) {
    return await db.booking.update({
      where: { id: bookingId },
      data: { attendedAt: attended ? new Date() : null, markedBy: attended ? markedBy : null },
    });
  }
}
