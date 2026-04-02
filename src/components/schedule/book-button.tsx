"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";
import { CalendarPlus, ShoppingCart } from "lucide-react";
import Link from "next/link";

interface BookButtonProps {
  classInstanceId: string;
  action: "book" | "waitlist" | "cancel";
  label: string;
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

export function BookButton({ classInstanceId, action, label }: BookButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [noCredits, setNoCredits] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    setCalendarUrl(null);
    setNoCredits(false);

    try {
      if (action === "cancel") {
        const bookingsRes = await fetch("/api/bookings?type=upcoming");
        const bookings = await bookingsRes.json();
        const booking = Array.isArray(bookings)
          ? bookings.find(
              (b: any) => b.classInstanceId === classInstanceId && b.status === "CONFIRMED"
            )
          : null;

        if (!booking) {
          toast.error("ההזמנה לא נמצאה");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/bookings/${booking.id}/cancel`, { method: "POST" });
        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || "הביטול נכשל");
          return;
        }

        toast.success(data.refunded ? "ההזמנה בוטלה, הקרדיט הוחזר" : "ההזמנה בוטלה (ללא החזר)");
      } else {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classInstanceId }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.error?.includes("יתרת שיעורים")) {
            setNoCredits(true);
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
      }

      router.refresh();
    } catch {
      toast.error("משהו השתבש, נסי שוב");
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

  if (noCredits) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <p className="text-[11px] text-red-500 font-medium">אין יתרת שיעורים</p>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 rounded-2xl bg-sage-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sage-700 transition-colors"
        >
          <ShoppingCart className="h-3 w-3" />
          לתשלום והרשמה
        </Link>
      </div>
    );
  }

  const variant = action === "cancel" ? "ghost" : action === "book" ? "default" : "outline";

  return (
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
  );
}
