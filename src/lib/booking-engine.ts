import { db } from "@/lib/db";
import { sendEmail, waitlistPromotionEmail } from "@/lib/email";
import { format } from "date-fns";
import { he } from "date-fns/locale";

const BookingStatus = { CONFIRMED: "CONFIRMED", CANCELLED: "CANCELLED", NO_SHOW: "NO_SHOW" } as const;
const WaitlistStatus = { WAITING: "WAITING", PROMOTED: "PROMOTED", EXPIRED: "EXPIRED", CANCELLED: "CANCELLED" } as const;
const PunchCardStatus = { ACTIVE: "ACTIVE", EXHAUSTED: "EXHAUSTED", EXPIRED: "EXPIRED" } as const;

interface PromotedUserInfo {
  email: string;
  name: string | null;
  className: string;
  classDate: Date;
  startTime: string;
}

/**
 * Fire-and-forget email dispatch after a transaction commits.
 * Failures are logged but don't propagate — the booking itself has
 * already been finalized in the DB.
 */
function dispatchPromotionEmail(info: PromotedUserInfo | null) {
  if (!info) return;
  try {
    const dateStr = format(info.classDate, "EEEE, d בMMMM yyyy", { locale: he });
    const { subject, html } = waitlistPromotionEmail(
      info.name || "תלמידה יקרה",
      info.className,
      dateStr,
      info.startTime,
    );
    // Do not await — keeps API response fast.
    sendEmail({ to: info.email, subject, html }).catch((err) => {
      console.error("[booking] promotion email failed:", err?.message || err);
    });
  } catch (err) {
    console.error("[booking] promotion email build failed:", err);
  }
}

export class BookingEngine {
  static async bookClass(userId: string, classInstanceId: string) {
    return await db.$transaction(
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

        return { type: "booking" as const, booking };
      },
      { isolationLevel: "Serializable", timeout: 10000 }
    );
  }

  static async cancelBooking(userId: string, bookingId: string) {
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

        const cancellationHours = Number(process.env.CANCELLATION_HOURS_BEFORE) || 6;
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
    dispatchPromotionEmail(promotedUser);

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

  static async adminRemoveStudent(classInstanceId: string, userId: string) {
    const { promotedUser } = await db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { userId_classInstanceId: { userId, classInstanceId } },
      });
      if (!booking || booking.status !== BookingStatus.CONFIRMED) {
        throw new Error("לא נמצאה הזמנה פעילה");
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });

      await tx.classInstance.update({
        where: { id: classInstanceId },
        data: { currentBookings: { decrement: 1 } },
      });

      const promoted = await BookingEngine.promoteFromWaitlist(tx, classInstanceId);
      const promotedUser: PromotedUserInfo | null = promoted
        ? {
            email: promoted.user.email,
            name: promoted.user.name,
            className: promoted.classInstance.classDefinition.title,
            classDate: new Date(promoted.classInstance.date),
            startTime: promoted.classInstance.startTime,
          }
        : null;

      return { removed: true, promotedUser };
    });

    dispatchPromotionEmail(promotedUser);

    return { removed: true };
  }

  static async markAttendance(bookingId: string, attended: boolean, markedBy: string) {
    return await db.booking.update({
      where: { id: bookingId },
      data: { attendedAt: attended ? new Date() : null, markedBy: attended ? markedBy : null },
    });
  }
}
