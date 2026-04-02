import { db } from "@/lib/db";

const BookingStatus = { CONFIRMED: "CONFIRMED", CANCELLED: "CANCELLED", NO_SHOW: "NO_SHOW" } as const;
const WaitlistStatus = { WAITING: "WAITING", PROMOTED: "PROMOTED", EXPIRED: "EXPIRED", CANCELLED: "CANCELLED" } as const;
const PunchCardStatus = { ACTIVE: "ACTIVE", EXHAUSTED: "EXHAUSTED", EXPIRED: "EXPIRED" } as const;

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

          const entry = await tx.waitlistEntry.create({
            data: {
              userId,
              classInstanceId,
              position: (maxPosition._max.position ?? 0) + 1,
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

        const booking = await tx.booking.create({
          data: {
            userId,
            classInstanceId,
            status: BookingStatus.CONFIRMED,
            punchCardId,
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
    return await db.$transaction(
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

        await BookingEngine.promoteFromWaitlist(tx, booking.classInstanceId);

        return { refunded: canRefund };
      },
      { isolationLevel: "Serializable", timeout: 10000 }
    );
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

    await tx.booking.create({
      data: { userId: user.id, classInstanceId, status: BookingStatus.CONFIRMED, punchCardId },
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

      const booking = await tx.booking.create({
        data: { userId, classInstanceId, status: BookingStatus.CONFIRMED },
      });

      await tx.classInstance.update({
        where: { id: classInstanceId },
        data: { currentBookings: { increment: 1 } },
      });

      return booking;
    });
  }

  static async adminRemoveStudent(classInstanceId: string, userId: string) {
    return await db.$transaction(async (tx) => {
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

      await BookingEngine.promoteFromWaitlist(tx, classInstanceId);
      return { removed: true };
    });
  }

  static async markAttendance(bookingId: string, attended: boolean, markedBy: string) {
    return await db.booking.update({
      where: { id: bookingId },
      data: { attendedAt: attended ? new Date() : null, markedBy: attended ? markedBy : null },
    });
  }
}
