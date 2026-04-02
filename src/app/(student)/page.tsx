import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { he } from "date-fns/locale";
import { BookButton } from "@/components/schedule/book-button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, User, ChevronRight, ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function SchedulePage({ searchParams }: Props) {
  const dbUser = await requireAuth();
  const isAdmin = dbUser.role === "ADMIN";

  const params = await searchParams;
  const weekOffset = parseInt(params.week || "0", 10);

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 0 });
  const weekEnd = addDays(weekStart, 7);
  const prevWeek = weekOffset - 1;
  const nextWeek = weekOffset + 1;

  const instances = await prisma.classInstance.findMany({
    where: {
      date: { gte: weekStart, lt: weekEnd },
      isCancelled: false,
    },
    include: {
      classDefinition: true,
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const userBookings = await prisma.booking.findMany({
    where: {
      userId: dbUser.id,
      status: "CONFIRMED",
      classInstanceId: { in: instances.map((i) => i.id) },
    },
    select: { classInstanceId: true },
  });
  const bookedSet = new Set(userBookings.map((b) => b.classInstanceId));

  const userWaitlist = await prisma.waitlistEntry.findMany({
    where: {
      userId: dbUser.id,
      status: "WAITING",
      classInstanceId: { in: instances.map((i) => i.id) },
    },
    select: { classInstanceId: true },
  });
  const waitlistSet = new Set(userWaitlist.map((w) => w.classInstanceId));

  const grouped: Record<string, typeof instances> = {};
  for (const inst of instances) {
    const key = format(inst.date, "yyyy-MM-dd");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(inst);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 pb-28">
      {/* ── כותרת + ניווט שבועי ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-sage-900">מערכת שעות</h1>
          <p className="text-sm text-sage-500 mt-1">
            שבוע {format(weekStart, "d בMMMM yyyy", { locale: he })}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded-2xl bg-sage-100 px-3 py-1.5 text-xs font-medium text-sage-700 hover:bg-sage-200 transition-colors"
          >
            ניהול מערכת
          </Link>
        )}
      </div>

      {/* ── כפתורי הבא/הקודם (מתאימים ל-RTL) ── */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/schedule?week=${nextWeek}`}
          className="flex items-center gap-1 rounded-2xl border border-sage-200 bg-white px-4 py-2 text-sm font-medium text-sage-600 hover:bg-sage-50 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
          שבוע הבא
        </Link>
        {weekOffset !== 0 && (
          <Link
            href="/schedule"
            className="text-xs text-sage-400 hover:text-sage-600 transition-colors"
          >
            חזרה להיום
          </Link>
        )}
        <Link
          href={`/schedule?week=${prevWeek}`}
          className="flex items-center gap-1 rounded-2xl border border-sage-200 bg-white px-4 py-2 text-sm font-medium text-sage-600 hover:bg-sage-50 transition-colors"
        >
          שבוע קודם
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </div>

      {/* ── תוכן לוח שיעורים ── */}
      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-3xl border border-sage-100 bg-white p-12 text-center shadow-sm">
          <p className="text-sage-400 text-lg">אין שיעורים בשבוע זה</p>
          <p className="text-sage-300 text-sm mt-2">נסי לעבור לשבוע הבא</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([dateStr, dayInstances]) => (
            <section key={dateStr}>
              <h2 className="text-sm font-bold text-sage-500 mb-3 pr-1">
                {format(new Date(dateStr), "EEEE, d בMMMM", { locale: he })}
              </h2>
              <div className="space-y-3">
                {dayInstances.map((inst) => {
                  const spots = inst.maxCapacity - inst._count.bookings;
                  const isAvailable = spots > 0;
                  const isBooked = bookedSet.has(inst.id);
                  const isOnWaitlist = waitlistSet.has(inst.id);
                  const def = inst.classDefinition;

                  return (
                    <div
                      key={inst.id}
                      className="rounded-3xl border border-sage-100 bg-white p-5 shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* שם שיעור + סטטוס */}
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-bold text-sage-900 truncate">{def.title}</h3>
                            {isBooked ? (
                              <Badge className="bg-sage-100 text-sage-700 border-0 rounded-full px-3">רשום/ה</Badge>
                            ) : isOnWaitlist ? (
                              <Badge className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3">בהמתנה</Badge>
                            ) : isAvailable ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3">יש מקום</Badge>
                            ) : (
                              <Badge className="bg-red-50 text-red-600 border border-red-200 rounded-full px-3">מלא</Badge>
                            )}
                          </div>

                          {def.description && (
                            <p className="text-xs text-sage-400 line-clamp-1 mb-2.5">{def.description}</p>
                          )}

                          {/* פרטי שיעור: מורה, שעה, מיקום */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-sage-500">
                            <span className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-sage-400" />
                              {def.instructor}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-sage-400" />
                              {inst.startTime} – {inst.endTime}
                            </span>
                            {def.location && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-sage-400" />
                                {def.location}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* כפתור פעולה */}
                        <div className="shrink-0 pt-1">
                          {isBooked ? (
                            <BookButton classInstanceId={inst.id} action="cancel" label="ביטול" />
                          ) : isOnWaitlist ? (
                            <span className="text-xs text-amber-600 font-medium">ברשימת המתנה</span>
                          ) : isAvailable ? (
                            <BookButton classInstanceId={inst.id} action="book" label="הרשמה" />
                          ) : (
                            <BookButton classInstanceId={inst.id} action="waitlist" label="רשימת המתנה" />
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
