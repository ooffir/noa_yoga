import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import type { Metadata } from "next";
import { format, startOfWeek, addDays, addWeeks } from "date-fns";
import { he } from "date-fns/locale";
import { BookButton } from "@/components/schedule/book-button";
import { Clock, MapPin, User, ChevronRight, ChevronLeft, CalendarDays } from "lucide-react";
import { toUTCDate } from "@/lib/utils";
import { getCapacityStatus } from "@/lib/capacity-status";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "מערכת שעות יוגה בחיפה — שיעורים שבועיים",
  description:
    "לוח שיעורי יוגה בחיפה אצל נועה אופיר — הרשמה אונליין לשיעורי Vinyasa, Hatha ונשימה. רשימת המתנה לשיעורים מלאים וביטול חינם בתוך חלון הזמן המוגדר.",
  keywords: [
    "מערכת שעות יוגה",
    "שיעורי יוגה בחיפה",
    "לוח שיעורים יוגה",
    "Vinyasa חיפה",
    "Hatha חיפה",
  ],
  alternates: { canonical: "/schedule" },
  openGraph: {
    title: "מערכת שעות | יוגה בחיפה — Noa Yogis",
    description:
      "הזמינו מקום לשיעור הבא שלכם או הצטרפו לרשימת המתנה — הכל במקום אחד.",
    url: "/schedule",
    type: "website",
    images: [{ url: "/yoga-pose.png", width: 1200, height: 630, alt: "מערכת שעות יוגה בחיפה" }],
  },
};

interface Props {
  searchParams: Promise<{ week?: string }>;
}

const getCachedScheduleInstances = unstable_cache(
  async (startIso: string, endIso: string) => {
    return prisma.classInstance.findMany({
      where: {
        date: { gte: new Date(startIso), lt: new Date(endIso) },
        isCancelled: false,
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        maxCapacity: true,
        classDefinition: {
          select: {
            title: true,
            description: true,
            instructor: true,
            location: true,
          },
        },
        _count: {
          select: {
            bookings: { where: { status: "CONFIRMED" } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  },
  ["schedule-instances"],
  { revalidate: 3600, tags: ["schedule"] }
);

export default async function SchedulePage({ searchParams }: Props) {
  const dbUser = await requireAuth();
  const isAdmin = dbUser.role === "ADMIN";

  const params = await searchParams;
  const weekOffset = parseInt(params.week || "0", 10);

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 0 });
  const weekEnd = addDays(weekStart, 7);
  const startUTC = toUTCDate(weekStart);
  const endUTC = toUTCDate(weekEnd);

  const [instances, userBookings, userWaitlist, settings] = await Promise.all([
    getCachedScheduleInstances(startUTC.toISOString(), endUTC.toISOString()),
    prisma.booking.findMany({
      where: { userId: dbUser.id, status: "CONFIRMED" },
      select: { classInstanceId: true },
    }),
    prisma.waitlistEntry.findMany({
      where: { userId: dbUser.id, status: "WAITING" },
      select: { id: true, classInstanceId: true, createdAt: true },
    }),
    prisma.siteSettings.findUnique({
      where: { id: "main" },
      select: {
        creditPrice: true,
        punchCard5Price: true,
        punchCardPrice: true,
        cancellationWindow: true,
      },
    }).catch(() => null),
  ]);

  // ── Compute "you are #N in line" for each waitlist entry ──
  // Typical student sits on 0-3 waitlists at once, so the N+1 query
  // cost is negligible. Position = count of WAITING entries for the
  // same classInstance with an earlier createdAt, + 1 (for themselves).
  //
  // This ignores the `position` integer column entirely because that
  // column can have gaps after leaveWaitlist() / EXPIRED skips and the
  // admin-manual-promote path. Ranking by createdAt is always correct
  // regardless of state transitions.
  const waitlistPositionByInstance: Record<string, number> = {};
  await Promise.all(
    userWaitlist.map(async (entry) => {
      const ahead = await prisma.waitlistEntry.count({
        where: {
          classInstanceId: entry.classInstanceId,
          status: "WAITING",
          createdAt: { lt: entry.createdAt },
        },
      });
      waitlistPositionByInstance[entry.classInstanceId] = ahead + 1;
    }),
  );

  const creditPrice = settings?.creditPrice ?? 50;
  const punchCard5Price = settings?.punchCard5Price ?? 200;
  const punchCardPrice = settings?.punchCardPrice ?? 350;
  const cancellationHours = settings?.cancellationWindow ?? 6;

  const bookedSet = new Set(userBookings.map((b) => b.classInstanceId));
  const waitlistSet = new Set(userWaitlist.map((w) => w.classInstanceId));

  // `unstable_cache` JSON-serializes its result, so dates come back as
  // ISO strings even though TS types them as Date. Normalize once here
  // so every downstream .toISOString() / format() call is safe.
  const normalizedInstances = instances.map((inst) => ({
    ...inst,
    date: new Date(inst.date),
  }));

  const grouped: Record<string, typeof normalizedInstances> = {};
  for (const inst of normalizedInstances) {
    const key = format(inst.date, "yyyy-MM-dd");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(inst);
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-8 pb-12">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-sage-900">מערכת שעות</h1>
          <p className="mt-1 text-sm text-sage-500 leading-relaxed">
            ניתן לבטל עד {cancellationHours} שעות לפני השיעור ולקבל קרדיט חזרה.
          </p>
          <p className="text-sm text-sage-500 mt-0.5">
            {format(weekStart, "d בMMMM", { locale: he })} – {format(addDays(weekStart, 6), "d בMMMM yyyy", { locale: he })}
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin" className="rounded-2xl bg-sage-100 px-3 py-1.5 text-xs font-medium text-sage-700 hover:bg-sage-200 transition-colors">
            ניהול מערכת
          </Link>
        )}
      </div>

      <div className="mb-8 flex flex-row-reverse items-center justify-between">
        <Link
          href={`/schedule?week=${weekOffset + 1}`}
          className="flex items-center gap-1 rounded-2xl border border-sage-200 bg-white px-4 py-2 text-sm font-medium text-sage-600 hover:bg-sage-50 transition-colors"
        >
          הבא
          <ChevronLeft className="h-4 w-4" />
        </Link>
        {weekOffset !== 0 && (
          <Link href="/schedule" className="text-xs font-medium text-sage-400 hover:text-sage-600 transition-colors">
            חזרה להיום
          </Link>
        )}
        <Link
          href={`/schedule?week=${weekOffset - 1}`}
          className="flex items-center gap-1 rounded-2xl border border-sage-200 bg-white px-4 py-2 text-sm font-medium text-sage-600 hover:bg-sage-50 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
          הקודם
        </Link>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-3xl border border-sage-100 bg-white p-14 text-center shadow-sm">
          <CalendarDays className="h-10 w-10 text-sage-200 mx-auto mb-4" />
          <p className="text-sage-500 text-lg font-medium">אין שיעורים מתוכננים לשבוע זה</p>
          <p className="text-sage-400 text-sm mt-1">נסו לעבור לשבוע הבא</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([dateStr, dayInstances]) => (
            <section key={dateStr}>
              <h2 className="text-sm font-bold text-sage-600 mb-3 pr-1">
                {format(new Date(dateStr + "T00:00:00Z"), "EEEE, d בMMMM", { locale: he })}
              </h2>
              <div className="space-y-3">
                {dayInstances.map((inst) => {
                  const availableSpots = inst.maxCapacity - inst._count.bookings;
                  const capacity = getCapacityStatus(availableSpots);
                  const isAvailable = capacity.hasSeats;
                  const isBooked = bookedSet.has(inst.id);
                  const isOnWaitlist = waitlistSet.has(inst.id);
                  const def = inst.classDefinition;

                  return (
                    <div key={inst.id} className="rounded-3xl border border-sage-100 bg-white p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-bold text-sage-900 text-base truncate">{def.title}</h3>
                            {isBooked ? (
                              <span className="inline-flex items-center rounded-full bg-sage-100 px-3 py-0.5 text-xs font-medium text-sage-700">רשום/ה</span>
                            ) : isOnWaitlist ? (
                              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-0.5 text-xs font-medium text-amber-700">
                                {waitlistPositionByInstance[inst.id]
                                  ? `מקום ${waitlistPositionByInstance[inst.id]} בתור`
                                  : "בהמתנה"}
                              </span>
                            ) : (
                              // Tier-based availability badge — copy + tone
                              // come from getCapacityStatus() so schedule
                              // and workshops stay visually consistent.
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium ${
                                  capacity.tone === "available"
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : capacity.tone === "limited"
                                    ? "bg-amber-50 border-amber-200 text-amber-700"
                                    : capacity.tone === "last"
                                    ? "bg-orange-50 border-orange-200 text-orange-700"
                                    : "bg-red-50 border-red-200 text-red-600"
                                }`}
                              >
                                {capacity.label}
                              </span>
                            )}
                          </div>
                          {def.description && (
                            <p className="text-xs text-sage-400 line-clamp-2 mb-3">{def.description}</p>
                          )}
                          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-sage-500">
                            <span className="flex items-center gap-1.5">
                              <User className="h-4 w-4 text-sage-400" />
                              <span className="font-medium">{def.instructor}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-4 w-4 text-sage-400" />
                              {inst.startTime} – {inst.endTime}
                            </span>
                            {def.location && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="h-4 w-4 text-sage-400" />
                                {def.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 pt-1">
                          {isBooked ? (
                            <BookButton
                              classInstanceId={inst.id}
                              action="cancel"
                              label="ביטול"
                              classTitle={def.title}
                              classDate={inst.date.toISOString()}
                              classStartTime={inst.startTime}
                              creditPrice={creditPrice}
                              punchCard5Price={punchCard5Price}
                              punchCardPrice={punchCardPrice}
                              cancellationHoursBefore={cancellationHours}
                            />
                          ) : isOnWaitlist ? (
                            <BookButton
                              classInstanceId={inst.id}
                              action="leave-waitlist"
                              label="יציאה מהמתנה"
                              classTitle={def.title}
                              classDate={inst.date.toISOString()}
                              classStartTime={inst.startTime}
                              creditPrice={creditPrice}
                              punchCard5Price={punchCard5Price}
                              punchCardPrice={punchCardPrice}
                              cancellationHoursBefore={cancellationHours}
                            />
                          ) : isAvailable ? (
                            <BookButton
                              classInstanceId={inst.id}
                              action="book"
                              label="הרשמה"
                              classTitle={def.title}
                              classDate={inst.date.toISOString()}
                              classStartTime={inst.startTime}
                              creditPrice={creditPrice}
                              punchCard5Price={punchCard5Price}
                              punchCardPrice={punchCardPrice}
                              cancellationHoursBefore={cancellationHours}
                            />
                          ) : (
                            <BookButton
                              classInstanceId={inst.id}
                              action="waitlist"
                              label="רשימת המתנה"
                              classTitle={def.title}
                              classDate={inst.date.toISOString()}
                              classStartTime={inst.startTime}
                              creditPrice={creditPrice}
                              punchCard5Price={punchCard5Price}
                              punchCardPrice={punchCardPrice}
                              cancellationHoursBefore={cancellationHours}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
