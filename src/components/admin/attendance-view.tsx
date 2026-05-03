"use client";

import { useState, useEffect } from "react";
import { format, addWeeks, startOfWeek } from "date-fns";
import { he } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  UserPlus,
  Clock3,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { formatTime } from "@/lib/utils";
import toast from "react-hot-toast";

/**
 * Build a `tel:` href from a user-entered phone number.
 *
 * The user could type "050-1234567", "+972 50 123 4567" etc. The tel:
 * scheme accepts those formats but we normalise to digits + leading "+"
 * so the dialer of every device parses it predictably.
 */
function buildTelHref(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return `tel:${hasPlus ? "+" : ""}${digits}`;
}

/**
 * Inline name + click-to-call phone link. Used in both the attendance
 * roster and the waitlist below, so the visual treatment stays
 * consistent. Phone is muted (text-sage-400, text-xs) so the name
 * remains the primary focus per design.
 */
function NameWithPhone({
  name,
  email,
  phone,
}: {
  name?: string | null;
  email: string;
  phone?: string | null;
}) {
  const displayName = name || email;
  return (
    <div className="min-w-0">
      <p className="font-medium text-sage-900 text-sm truncate">
        {displayName}
      </p>
      {phone && (
        <a
          href={buildTelHref(phone)}
          dir="ltr"
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-sage-400 hover:text-sage-700 hover:underline transition-colors"
          aria-label={`התקשרי אל ${displayName} בטלפון ${phone}`}
        >
          <Phone className="h-3 w-3 shrink-0" />
          <span dir="ltr">{phone}</span>
        </a>
      )}
    </div>
  );
}

interface AdminClass {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  instructor: string;
  maxCapacity: number;
  currentBookings: number;
}

interface AttendanceBooking {
  id: string;
  attendedAt: string | null;
  user: { id: string; name: string; email: string; phone: string | null };
}

interface WaitlistEntry {
  id: string;
  createdAt: string;
  user: { id: string; name: string; email: string; phone: string | null };
}

export function AttendanceView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<AttendanceBooking[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/schedule?week=${weekOffset}`)
      .then((r) => r.json())
      .then((data) => setClasses(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [weekOffset]);

  const loadAttendance = async (instanceId: string) => {
    setSelectedClass(instanceId);
    setAttendanceLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance/${instanceId}`);
      const data = await res.json();
      // New response shape: { bookings: [], waitlist: [] }
      // Keep backwards compatibility with the old array shape in case of
      // a stale deploy serving the array form.
      if (Array.isArray(data)) {
        setAttendees(data);
        setWaitlist([]);
      } else {
        setAttendees(data.bookings || []);
        setWaitlist(data.waitlist || []);
      }
    } catch {
      toast.error("שגיאה בטעינת נוכחות");
    }
    setAttendanceLoading(false);
  };

  const markAttendance = async (bookingId: string, attended: boolean) => {
    setMarkingId(bookingId);
    try {
      const res = await fetch(`/api/admin/attendance/${selectedClass}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, attended }),
      });

      if (res.ok) {
        setAttendees((prev) =>
          prev.map((a) =>
            a.id === bookingId
              ? { ...a, attendedAt: attended ? new Date().toISOString() : null }
              : a
          )
        );
        toast.success(attended ? "סומנה נוכחות" : "הנוכחות הוסרה");
      }
    } catch {
      toast.error("שגיאה בעדכון נוכחות");
    }
    setMarkingId(null);
  };

  const promoteFromWaitlist = async (userId: string, userName: string) => {
    if (
      !confirm(
        `להכניס את ${userName} לשיעור? פעולה זו תוציא את הסטודנטית מרשימת ההמתנה, תיצור לה רישום מאושר ותנכה קרדיט אחד מהיתרה שלה.`,
      )
    )
      return;
    if (!selectedClass) return;

    setPromotingUserId(userId);
    try {
      const res = await fetch(`/api/admin/attendance/${selectedClass}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote", userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "פעולה נכשלה");
        return;
      }
      toast.success(
        data.overrode
          ? "הסטודנטית נכנסה לשיעור (מעל הקיבולת — +1 מעל המקסימום)"
          : "הסטודנטית נכנסה לשיעור",
      );
      await loadAttendance(selectedClass); // refresh both lists
    } catch {
      toast.error("פעולה נכשלה");
    } finally {
      setPromotingUserId(null);
    }
  };

  const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* ─── Class list ─── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-sage-700">
            {format(weekStart, "d בMMMM yyyy", { locale: he })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <PageLoader />
        ) : (
          <div className="space-y-2">
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => loadAttendance(cls.id)}
                className={`w-full text-right rounded-2xl border p-3 transition-colors ${
                  selectedClass === cls.id
                    ? "border-sage-400 bg-sage-50"
                    : "border-sage-100 bg-white hover:bg-sage-50/50"
                }`}
              >
                <p className="font-medium text-sage-900 text-sm">{cls.title}</p>
                <p className="text-xs text-sage-500">
                  {format(new Date(cls.date), "EEEE, d בMMMM", { locale: he })} · {formatTime(cls.startTime)} · {cls.currentBookings}/{cls.maxCapacity}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Attendance + waitlist panel ─── */}
      <div className="space-y-4">
        {/* Booked students */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              רשומות
              {attendees.length > 0 && (
                <Badge className="rounded-full text-xs">{attendees.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedClass ? (
              <p className="text-sage-400 text-sm text-center py-8">
                בחרו שיעור כדי לראות את הנוכחות
              </p>
            ) : attendanceLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            ) : attendees.length === 0 ? (
              <p className="text-sage-400 text-sm text-center py-8">
                אין הזמנות לשיעור זה
              </p>
            ) : (
              <div className="space-y-2">
                {attendees.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-sage-100 px-4 py-3"
                  >
                    <NameWithPhone
                      name={booking.user.name}
                      email={booking.user.email}
                      phone={booking.user.phone}
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      {booking.attendedAt ? (
                        <>
                          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">נוכחת</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAttendance(booking.id, false)}
                            disabled={markingId === booking.id}
                          >
                            {markingId === booking.id ? <Spinner className="h-3 w-3" /> : <X className="h-4 w-4 text-red-400" />}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => markAttendance(booking.id, true)}
                          disabled={markingId === booking.id}
                        >
                          {markingId === booking.id ? (
                            <Spinner className="h-3 w-3" />
                          ) : (
                            <>
                              <Check className="h-4 w-4 ml-1" />
                              סימון נוכחות
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Waitlist section — only shown when a class is selected
             AND has active waiters. Gives the admin a direct path to
             promote a specific student out of order (medical, etc.). */}
        {selectedClass && !attendanceLoading && waitlist.length > 0 && (
          <Card className="rounded-3xl border-amber-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-amber-600" />
                רשימת המתנה
                <Badge className="rounded-full text-xs bg-amber-100 text-amber-700 border border-amber-200">
                  {waitlist.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {waitlist.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/30 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                        {idx + 1}
                      </span>
                      <NameWithPhone
                        name={entry.user.name}
                        email={entry.user.email}
                        phone={entry.user.phone}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5 border-sage-300 hover:bg-sage-50"
                      onClick={() =>
                        promoteFromWaitlist(
                          entry.user.id,
                          entry.user.name || entry.user.email,
                        )
                      }
                      disabled={promotingUserId === entry.user.id}
                    >
                      {promotingUserId === entry.user.id ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" />
                          הכנס לשיעור
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-sage-500 leading-relaxed">
                לחיצה על &quot;הכנס לשיעור&quot; יוצרת רישום מאושר ומנכה קרדיט אחד
                מהסטודנטית. ניתן להכניס גם מעבר לקיבולת המרבית.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
