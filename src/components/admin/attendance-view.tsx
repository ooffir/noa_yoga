"use client";

import { useState, useEffect } from "react";
import { format, addWeeks, startOfWeek } from "date-fns";
import { he } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { formatTime } from "@/lib/utils";
import toast from "react-hot-toast";

interface AdminClass {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  instructor: string;
  maxCapacity: number;
  currentBookings: number;
  bookings: {
    id?: string;
    user: { id: string; name: string; email: string };
  }[];
}

interface AttendanceBooking {
  id: string;
  attendedAt: string | null;
  user: { id: string; name: string; email: string; phone: string | null };
}

export function AttendanceView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<AttendanceBooking[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

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
      setAttendees(data);
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

  const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* רשימת שיעורים */}
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

      {/* פאנל נוכחות */}
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg">נוכחות</CardTitle>
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
                  className="flex items-center justify-between rounded-2xl border border-sage-100 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-sage-900 text-sm">
                      {booking.user.name || booking.user.email}
                    </p>
                    {booking.user.phone && (
                      <p className="text-xs text-sage-400">{booking.user.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
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
    </div>
  );
}
