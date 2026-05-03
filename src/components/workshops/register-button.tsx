"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";
import { generatePaymeSaleForWorkshop } from "@/actions/payme";
import { ProfileGateDialog } from "@/components/profile/profile-gate-dialog";

interface Props {
  workshopId: string;
  workshopTitle: string;
  workshopPrice: number;
}

/**
 * Workshop register button — two-step flow.
 *
 *   Step 1: click "הירשמו ושלמו" → opens a consent dialog that discloses
 *           the cancellation / refund policy (required by Israeli
 *           Consumer Protection Law חוק הגנת הצרכן סעיף 14ג for
 *           remote / online transactions).
 *   Step 2: user checks the box + clicks "אישור והמשך לתשלום" →
 *           server action runs, PayMe page opens.
 *
 * The disclosure must be visible at point of sale, not buried in a
 * `/refund-policy` footer link — this is the legal distinction between
 * "available" and "prominent".
 */
export function WorkshopRegisterButton({
  workshopId,
  workshopTitle,
  workshopPrice,
}: Props) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  // Synchronous double-click guard — useState is batched, useRef is not.
  const submittingRef = useRef(false);
  const [profileGateOpen, setProfileGateOpen] = useState(false);

  const loading = pending || redirecting;

  const openDialog = () => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    setConsented(false);
    setDialogOpen(true);
  };

  const confirmAndPay = () => {
    if (!consented) {
      toast.error("נא לאשר את תנאי הביטול כדי להמשיך");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;

    startTransition(async () => {
      const result = await generatePaymeSaleForWorkshop(workshopId);

      if (!result.ok) {
        if (result.requiresProfile) {
          // Close consent dialog so user sees the profile gate clearly,
          // then re-fire confirmAndPay() after they save.
          setDialogOpen(false);
          setProfileGateOpen(true);
          submittingRef.current = false;
          return;
        }
        toast.error(result.error);
        submittingRef.current = false;
        return;
      }

      toast.success("מעבירים לדף התשלום…");
      setRedirecting(true);
      window.location.href = result.url;
    });
  };

  return (
    <>
      <Button
        onClick={openDialog}
        disabled={loading}
        className="rounded-2xl text-sm"
      >
        {loading ? <Spinner className="h-4 w-4" /> : "הירשמו ושלמו"}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader className="mb-3">
            <DialogTitle className="text-xl text-sage-900">
              הרשמה לסדנה
            </DialogTitle>
            <DialogDescription>
              {workshopTitle} · ₪{workshopPrice}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-sage-200 bg-sage-50 p-4 text-sm leading-relaxed text-sage-700">
            <p className="font-bold text-sage-900 mb-2">תנאי ביטול והחזר כספי</p>
            <ul className="list-disc pr-5 space-y-1.5 text-[13px] text-sage-600">
              <li>
                ביטול <strong>עד 14 ימים לפני</strong> מועד הסדנה — החזר כספי
                מלא של ₪{workshopPrice}.
              </li>
              <li>
                ביטול <strong>7–14 ימים לפני</strong> — החזר של 50% מסכום הרכישה.
              </li>
              <li>
                ביטול <strong>פחות מ-7 ימים לפני</strong> — ללא החזר כספי,
                אך ניתן להעביר את המקום לאדם אחר בתיאום עם הסטודיו.
              </li>
              <li>
                במידה והסטודיו יבטל את הסדנה מכל סיבה שהיא — תקבלו החזר
                כספי מלא.
              </li>
            </ul>
            <p className="mt-3 text-xs text-sage-500">
              בקשות ביטול יש לשלוח למייל{" "}
              <a
                href="mailto:noayogaa@gmail.com"
                className="underline text-sage-700"
              >
                noayogaa@gmail.com
              </a>
              .
            </p>
          </div>

          <label className="mt-4 flex items-start gap-3 cursor-pointer rounded-2xl border border-sage-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-sage-300 text-sage-600 focus:ring-sage-500 accent-sage-600 shrink-0"
            />
            <span className="text-sm text-sage-800 leading-relaxed">
              קראתי ואני מסכימ/ה לתנאי הביטול וההחזר הכספי המפורטים מעלה.
            </span>
          </label>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={loading}
              className="rounded-2xl text-sage-500"
            >
              ביטול
            </Button>
            <Button
              onClick={confirmAndPay}
              disabled={loading || !consented}
              className="rounded-2xl gap-2"
            >
              {loading ? (
                <Spinner className="h-4 w-4" />
              ) : (
                "אישור והמשך לתשלום"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProfileGateDialog
        open={profileGateOpen}
        onOpenChange={setProfileGateOpen}
        contextMessage="לפני המעבר לתשלום עבור הסדנה, נשמח אם תעדכני את שמך ומספר הטלפון שלך."
        onSaved={() => {
          // Reopen the consent dialog (user still needs to consent),
          // then auto-submit if they had already consented before the gate fired.
          setTimeout(() => {
            if (consented) {
              confirmAndPay();
            } else {
              setDialogOpen(true);
            }
          }, 250);
        }}
      />
    </>
  );
}
