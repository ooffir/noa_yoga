"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";
import { CalendarPlus } from "lucide-react";
import { BookChoiceDialog } from "@/components/schedule/book-choice-dialog";
import { CancelBookingDialog } from "@/components/schedule/cancel-booking-dialog";

interface BookButtonProps {
  classInstanceId: string;
  action: "book" | "waitlist" | "cancel";
  label: string;
  classTitle?: string;
  classDate?: string | Date;
  classStartTime?: string;
  creditPrice?: number;
  punchCard5Price?: number;
  punchCardPrice?: number;
  cancellationHoursBefore?: number;
}

function buildGoogleCalendarUrl(event: {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}): string {
  const dateStr = event.date.split("T")[0].replace(/-/g, "");
  const start = `${dateStr}T${event.startTime.replace(":", "")}00`;
  const end = `${dateStr}T${event.endTime.replace(":", "")}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    location: event.location,
    ctz: "Asia/Jerusalem",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function BookButton({
  classInstanceId,
  action,
  label,
  classTitle,
  classDate,
  classStartTime,
  creditPrice = 50,
  punchCard5Price = 200,
  punchCardPrice = 350,
  cancellationHoursBefore = 6,
}: BookButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);

  const handleClick = async () => {
    // Cancel flow — fetch booking id, then open dialog instead of cancelling immediately.
    if (action === "cancel") {
      setLoading(true);
      try {
        const bookingsRes = await fetch("/api/bookings?type=upcoming");
        const bookings = await bookingsRes.json();
        const booking = Array.isArray(bookings)
          ? bookings.find(
              (b: any) => b.classInstanceId === classInstanceId && b.status === "CONFIRMED"
            )
          : null;

        if (!booking) {
          toast.error("ההזמנה לא נמצאה");
          return;
        }
        setCancelBookingId(booking.id);
        setCancelDialogOpen(true);
      } catch {
        toast.error("טעינת ההזמנה נכשלה");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Book / waitlist flow
    setLoading(true);
    setCalendarUrl(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classInstanceId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes("יתרת שיעורים")) {
          setChoiceOpen(true);
        } else {
          toast.error(data.error || "הפעולה נכשלה");
        }
        return;
      }

      if (data.type === "waitlist") {
        toast.success("נוספת לרשימת ההמתנה!");
      } else {
        toast.success("ההרשמה אושרה!");
        if (data.calendarEvent) {
          setCalendarUrl(buildGoogleCalendarUrl(data.calendarEvent));
        }
      }

      router.refresh();
    } catch {
      toast.error("משהו השתבש, נסו שוב");
    } finally {
      setLoading(false);
    }
  };

  if (calendarUrl) {
    return (
      <a
        href={calendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-2xl bg-sage-100 px-3 py-1.5 text-xs font-medium text-sage-700 hover:bg-sage-200 transition-colors"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        הוסף ליומן
      </a>
    );
  }

  const variant = action === "cancel" ? "ghost" : action === "book" ? "default" : "outline";

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={handleClick}
        disabled={loading}
        className={
          action === "cancel"
            ? "text-red-500 hover:text-red-600 hover:bg-red-50 text-xs"
            : "min-w-[80px] text-xs"
        }
      >
        {loading ? <Spinner className="h-4 w-4" /> : label}
      </Button>

      <BookChoiceDialog
        open={choiceOpen}
        onOpenChange={setChoiceOpen}
        classInstanceId={classInstanceId}
        classTitle={classTitle}
        creditPrice={creditPrice}
        punchCard5Price={punchCard5Price}
        punchCardPrice={punchCardPrice}
      />

      {cancelBookingId && classDate && classStartTime && (
        <CancelBookingDialog
          open={cancelDialogOpen}
          onOpenChange={(o) => {
            setCancelDialogOpen(o);
            if (!o) setCancelBookingId(null);
          }}
          bookingId={cancelBookingId}
          classTitle={classTitle || "השיעור"}
          classDate={classDate}
          classStartTime={classStartTime}
          cancellationHoursBefore={cancellationHoursBefore}
        />
      )}
    </>
  );
}
