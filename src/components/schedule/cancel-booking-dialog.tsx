"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  classTitle: string;
  classDate: string | Date;
  classStartTime: string; // "HH:MM"
  cancellationHoursBefore?: number;
  onCancelled?: (refunded: boolean) => void;
}

export function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  classTitle,
  classDate,
  classStartTime,
  cancellationHoursBefore = 6,
  onCancelled,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // Recompute on every render so the dialog always reflects current time.
  const { canRefund, hoursUntilClass, classMoment } = useMemo(() => {
    const [h, m] = classStartTime.split(":").map(Number);
    const dt = new Date(classDate);
    dt.setHours(h, m, 0, 0);
    const diff = (dt.getTime() - Date.now()) / (1000 * 60 * 60);
    return {
      canRefund: diff >= cancellationHoursBefore,
      hoursUntilClass: Math.max(0, diff),
      classMoment: dt,
    };
  }, [classDate, classStartTime, cancellationHoursBefore]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "הביטול נכשל");
        return;
      }

      if (data.refunded) {
        toast.success("ההזמנה בוטלה — 1 קרדיט הוחזר לחשבון");
      } else {
        toast("ההזמנה בוטלה — ללא החזר קרדיט", { icon: "⏳" });
      }

      onCancelled?.(data.refunded);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("משהו השתבש, נסו שוב");
    } finally {
      setSubmitting(false);
    }
  };

  const formattedClassDateTime = useMemo(
    () => format(classMoment, "EEEE, d בMMMM · HH:mm", { locale: he }),
    [classMoment],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl text-sage-900">ביטול הזמנה</DialogTitle>
          <DialogDescription>
            {classTitle} · {formattedClassDateTime}
          </DialogDescription>
        </DialogHeader>

        {canRefund ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
              <div>
                <p className="font-bold text-emerald-900">
                  הביטול בתוך זמן החינם
                </p>
                <p className="mt-1 text-sm text-emerald-700">
                  נותרו {Math.round(hoursUntilClass)} שעות עד תחילת השיעור. עם אישור הביטול, קרדיט אחד יוחזר לחשבון שלך.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-amber-900">
                  זמן הביטול נגמר
                </p>
                <p className="mt-1 text-sm text-amber-800 leading-relaxed">
                  ביטול חינם אפשרי עד {cancellationHoursBefore} שעות לפני השיעור. נותרו רק{" "}
                  {hoursUntilClass < 1
                    ? `${Math.round(hoursUntilClass * 60)} דקות`
                    : `${Math.round(hoursUntilClass)} שעות`}{" "}
                  עד לתחילת השיעור, לכן הביטול הוא <strong>ללא החזר קרדיט</strong>. 
                  אם תבטלו, המקום יתפנה לתלמידות אחרות אבל הקרדיט לא יוחזר.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="rounded-2xl"
          >
            השארו רשומים
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className={
              canRefund
                ? "rounded-2xl bg-sage-600 hover:bg-sage-700"
                : "rounded-2xl bg-red-500 hover:bg-red-600 text-white"
            }
          >
            {submitting ? (
              <Spinner className="h-4 w-4" />
            ) : canRefund ? (
              "בטלו והחזירו קרדיט"
            ) : (
              "בטלו בכל זאת (ללא החזר)"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
