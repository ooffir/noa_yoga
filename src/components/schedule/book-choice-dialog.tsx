"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Ticket, Sparkles, Package, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";
import { generatePaymeSaleForCredits } from "@/actions/payme";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classInstanceId: string;
  classTitle?: string;
  creditPrice: number;
  punchCard5Price: number;
  punchCardPrice: number; // 10-session card
}

/**
 * Dialog shown when a student with 0 credits clicks "הרשמה" on a class.
 *
 * Presents the three purchase paths — each matches exactly what's on the
 * /pricing page, with prices fetched from SiteSettings (not hardcoded):
 *
 *   1. Single class  → PayMe checkout → auto-books the class on return
 *   2. 5-session card → /pricing (full tier comparison)
 *   3. 10-session card → /pricing
 *
 * The single-class option is the only one that auto-books because it's
 * the only purchase that maps 1:1 to "I want this specific class right
 * now". Punch cards are a commitment — user should see the whole tier
 * comparison on /pricing before committing.
 */
export function BookChoiceDialog({
  open,
  onOpenChange,
  classInstanceId,
  classTitle,
  creditPrice,
  punchCard5Price,
  punchCardPrice,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  // Synchronous double-click guard (see pricing-cards.tsx for rationale).
  const submittingRef = useRef(false);

  const loading = pending || redirecting;

  const handleSingleClass = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;

    startTransition(async () => {
      const result = await generatePaymeSaleForCredits(
        "SINGLE_CLASS",
        classInstanceId,
      );
      if (!result.ok) {
        toast.error(result.error);
        submittingRef.current = false;
        return;
      }
      toast.success("מעבירים לדף התשלום…");
      setRedirecting(true);
      window.location.href = result.url;
    });
  };

  const handleGoToPricing = () => {
    toast("מעבירים לעמוד המחירון…", { icon: "🎟️" });
    router.push("/pricing");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="mb-5">
          <DialogTitle className="text-xl text-sage-900">איך תרצו לשלם?</DialogTitle>
          <DialogDescription>
            {classTitle ? `הרשמה לשיעור "${classTitle}"` : "אין לכם עדיין יתרת שיעורים."}{" "}
            אפשר לשלם על השיעור הזה בלבד, או לרכוש כרטיסייה משתלמת יותר.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* ── Option 1: Single class (pay & auto-book) ── */}
          <button
            type="button"
            onClick={handleSingleClass}
            disabled={loading}
            className="group flex w-full items-center justify-between rounded-3xl border-2 border-sage-200 bg-white p-5 text-right transition-all hover:border-sage-400 hover:bg-sage-50 active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage-100 text-sage-600">
                {loading ? <Spinner className="h-5 w-5" /> : <Ticket className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-bold text-sage-900">שיעור בודד</p>
                <p className="text-xs text-sage-500">תשלום ורישום ישיר לשיעור</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-sage-800">₪{creditPrice}</span>
              <ArrowLeft className="h-4 w-4 text-sage-400 transition-transform group-hover:-translate-x-1" />
            </div>
          </button>

          {/* ── Option 2: 5-session card (redirects to /pricing) ── */}
          <button
            type="button"
            onClick={handleGoToPricing}
            disabled={loading}
            className="group flex w-full items-center justify-between rounded-3xl border-2 border-sage-200 bg-white p-5 text-right transition-all hover:border-sage-400 hover:bg-sage-50 active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-sage-900">כרטיסייה של 5 שיעורים</p>
                <p className="text-xs text-sage-500">חצי מחויבות — מעבר לעמוד המחירון</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-sage-800">₪{punchCard5Price}</span>
              <ArrowLeft className="h-4 w-4 text-sage-400 transition-transform group-hover:-translate-x-1" />
            </div>
          </button>

          {/* ── Option 3: 10-session card (redirects to /pricing) ── */}
          <button
            type="button"
            onClick={handleGoToPricing}
            disabled={loading}
            className="group flex w-full items-center justify-between rounded-3xl border-2 border-sage-200 bg-gradient-to-bl from-sage-50 to-white p-5 text-right transition-all hover:border-sage-400 hover:from-sage-100 active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage-600 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-sage-900">כרטיסייה של 10 שיעורים</p>
                <p className="text-xs text-sage-500">המשתלם ביותר — מעבר לעמוד המחירון</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-sage-800">₪{punchCardPrice}</span>
              <ArrowLeft className="h-4 w-4 text-sage-400 transition-transform group-hover:-translate-x-1" />
            </div>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="rounded-2xl text-sage-500"
          >
            ביטול
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
