import { db } from "@/lib/db";
import { day_of_week } from "@prisma/client";
import { addDays, startOfWeek, format } from "date-fns";
import { toUTCDate } from "@/lib/utils";

const DAY_MAP: Record<day_of_week, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export async function generateClassInstances(weeksAhead: number = 4) {
  const definitions = await db.classDefinition.findMany({
    where: { isActive: true },
  });

  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const created: string[] = [];

  for (const def of definitions) {
    const targetDay = DAY_MAP[def.dayOfWeek];

    if (!def.isRecurring) continue;

    for (let week = 0; week < weeksAhead; week++) {
      const localDate = addDays(weekStart, week * 7 + targetDay);
      const localStr = format(localDate, "yyyy-MM-dd");

      if (localStr < todayStr) continue;

      const dateUTC = new Date(localStr + "T00:00:00Z");

      try {
        await db.classInstance.upsert({
          where: {
            classDefId_date: { classDefId: def.id, date: dateUTC },
          },
          create: {
            classDefId: def.id,
            date: dateUTC,
            startTime: def.startTime,
            endTime: def.endTime,
            maxCapacity: def.maxCapacity,
          },
          update: {},
        });
        created.push(`${def.title} on ${localStr}`);
      } catch {
        // skip duplicates
      }
    }
  }

  return created;
}

export async function generateSingleInstance(
  classDefId: string,
  dateStr: string
) {
  const dateUTC = new Date(dateStr + "T00:00:00Z");
  const def = await db.classDefinition.findUnique({
    where: { id: classDefId },
  });
  if (!def) throw new Error("ClassDefinition not found");

  return db.classInstance.upsert({
    where: { classDefId_date: { classDefId, date: dateUTC } },
    create: {
      classDefId,
      date: dateUTC,
      startTime: def.startTime,
      endTime: def.endTime,
      maxCapacity: def.maxCapacity,
    },
    update: {},
  });
}

export async function generateRecurringInstances(
  classDefId: string,
  startDateStr: string,
  weeksAhead: number = 12
) {
  const def = await db.classDefinition.findUnique({
    where: { id: classDefId },
  });
  if (!def) throw new Error("ClassDefinition not found");

  const created: string[] = [];
  const startDate = new Date(startDateStr + "T00:00:00Z");

  for (let week = 0; week < weeksAhead; week++) {
    const date = addDays(startDate, week * 7);
    const dateStr = format(date, "yyyy-MM-dd");
    const dateUTC = new Date(dateStr + "T00:00:00Z");

    try {
      await db.classInstance.upsert({
        where: { classDefId_date: { classDefId, date: dateUTC } },
        create: {
          classDefId,
          date: dateUTC,
          startTime: def.startTime,
          endTime: def.endTime,
          maxCapacity: def.maxCapacity,
        },
        update: {},
      });
      created.push(dateStr);
    } catch {
      // skip
    }
  }

  return created;
}

export async function getWeeklySchedule(weekStartDate?: Date) {
  const start = weekStartDate || startOfWeek(new Date(), { weekStartsOn: 0 });
  const startUTC = toUTCDate(start);
  const endUTC = toUTCDate(addDays(start, 7));

  const instances = await db.classInstance.findMany({
    where: {
      date: { gte: startUTC, lt: endUTC },
      isCancelled: false,
    },
    include: {
      classDefinition: true,
      _count: {
        select: { bookings: { where: { status: "CONFIRMED" } } },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return instances.map((instance) => ({
    id: instance.id,
    title: instance.classDefinition.title,
    description: instance.classDefinition.description,
    instructor: instance.classDefinition.instructor,
    date: instance.date,
    startTime: instance.startTime,
    endTime: instance.endTime,
    location: instance.classDefinition.location,
    isAvailable: instance._count.bookings < instance.maxCapacity,
  }));
}

export async function getAdminWeeklySchedule(
  weekStartDate?: Date,
  opts?: { includeCancelled?: boolean },
) {
  const start = weekStartDate || startOfWeek(new Date(), { weekStartsOn: 0 });
  const startUTC = toUTCDate(start);
  const endUTC = toUTCDate(addDays(start, 7));

  // By default, hide cancelled instances from admin views — keeps the
  // schedule + attendance lists focused on what's actually happening.
  // Pass `includeCancelled: true` (e.g. via the "הצג שיעורים שבוטלו"
  // toggle) to surface them again for review/audit.
  const includeCancelled = opts?.includeCancelled ?? false;

  const instances = await db.classInstance.findMany({
    where: {
      date: { gte: startUTC, lt: endUTC },
      ...(includeCancelled ? {} : { isCancelled: false }),
    },
    include: {
      classDefinition: true,
      bookings: {
        where: { status: "CONFIRMED" },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      waitlistEntries: {
        where: { status: "WAITING" },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return instances.map((instance) => ({
    id: instance.id,
    classDefId: instance.classDefId,
    title: instance.classDefinition.title,
    description: instance.classDefinition.description,
    instructor: instance.classDefinition.instructor,
    date: instance.date,
    startTime: instance.startTime,
    endTime: instance.endTime,
    location: instance.classDefinition.location,
    maxCapacity: instance.maxCapacity,
    currentBookings: instance.bookings.length,
    isCancelled: instance.isCancelled,
    isRecurring: instance.classDefinition.isRecurring,
    bookings: instance.bookings,
    waitlist: instance.waitlistEntries,
  }));
}
