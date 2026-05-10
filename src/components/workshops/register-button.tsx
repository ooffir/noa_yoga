"use client";

import { useRef, useState, useTransition, useMemo } from "react";
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
import { AlertTriangle } from "lucide-react";
import { generatePaymeSaleForWorkshop } from "@/actions/payme";
import { ProfileGateDialog } from "@/components/profile/profile-gate-dialog";

interface Props {
  workshopId: string;
  workshopTitle: string;
  /** Per-ticket price in ILS (the total = workshopPrice × quantity). */
  workshopPrice: number;
  /**
   * Remaining seats on this workshop. `null` = unlimited capacity (no
   * limit set). When a number, the quantity dropdown is capped at
   * min(5, availableSpots) so the user can't pick more tickets than
   * actually exist.
   */
  availableSpots: number | null;
  /**
   * How many tickets THIS user already has CONFIRMED on this workshop.
   * When > 0, a warning banner appears in the consent dialog asking
   * them to confirm they want to buy more (= bringing more guests).
   */
  userExistingTickets: number;
}

// Hard cap matches the server-side MAX_WORKSHOP_QUANTITY_PER_PURCHASE.
const MAX_QUANTITY = 5;

/**
 * Workshop register button — three-step flow.
 *
 *   Step 1: click "הירשמו ושלמו" → opens a consent dialog with:
 *           • repeat-purchase warning (if userExistingTickets > 0)
 *           • cancellation / refund policy
 *           • quantity dropdown (1..min(5, availableSpots))
 *           • live total price = workshopPrice × quantity
 *   Step 2: user checks the consent box + clicks "אישור והמשך לתשלום"
 *   Step 3: server action runs, PayMe page opens with the multiplied total.
 *
 * Repeat-purchase warning required because we removed the
 * @@unique([userId, workshopId]) constraint — a user can now legitimately
 * buy more tickets for the same workshop (e.g. bringing a friend later).
 * The warning makes sure that's intentional and not a mistake.
 */
export function WorkshopRegisterButton({
  workshopId,
  workshopTitle,
  workshopPrice,
  availableSpots,
  userExistingTickets,
}: Props) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  const [quantity, setQuantity] = useState(1);
  // Synchronous double-click guard — useState is batched, useRef is not.
  const submittingRef = useRef(false);
  const [profileGateOpen, setProfileGateOpen] = useState(false);

  const loading = pending || redirecting;

  // Quantity range clamps to min(5, availableSpots). When availableSpots
  // is null we assume unlimited and use the global MAX_QUANTITY.
  const maxQuantity = useMemo(() => {
    if (availableSpots == null) return MAX_QUANTITY;
    return Math.min(MAX_QUANTITY, Math.max(1, availableSpots));
  }, [availableSpots]);

  // Build dropdown options 1..maxQuantity inclusive.
  const quantityOptions = useMemo(
    () => Array.from({ length: maxQuantity }, (_, i) => i + 1),
    [maxQuantity],
  );

  const totalPrice = workshopPrice * quantity;
  const hasRepeatWarning = userExistingTickets > 0;

  const openDialog = () => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    setConsented(false);
    setQuantity(1);
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
      const result = await generatePaymeSaleForWorkshop(workshopId, quantity);

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
              {workshopTitle} · ₪{workshopPrice} לכרטיס
            </DialogDescription>
          </DialogHeader>

          {/* ════ Repeat-purchase warning (only when user already has tickets) ════ */}
          {hasRepeatWarning && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-amber-900">
                  שימי לב: יש לך כבר רישום פעיל לסדנה
                </p>
                <p className="mt-1 text-sm text-amber-800 leading-relaxed">
                  כבר רכשת {userExistingTickets}{" "}
                  {userExistingTickets === 1 ? "כרטיס" : "כרטיסים"} לסדנה זו.
                  האם את בטוחה שברצונך לרכוש כרטיסים נוספים? (לדוגמה — להבאת
                  חברה או בן זוג)
                </p>
              </div>
            </div>
          )}

          {/* ════ Quantity selector + live total ════ */}
          <div className="mb-4 rounded-2xl border border-sage-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label
                  htmlFor="workshop-quantity"
                  className="block text-sm font-medium text-sage-700"
                >
                  כמות כרטיסים
                </label>
                {availableSpots != null && availableSpots <= MAX_QUANTITY && (
                  <p className="mt-0.5 text-[11px] text-sage-500">
                    נשארו {availableSpots}{" "}
                    {availableSpots === 1 ? "מקום" : "מקומות"} בלבד
                  </p>
                )}
              </div>
              <select
                id="workshop-quantity"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="flex h-10 min-w-[80px] rounded-xl border border-sage-200 bg-white px-3 text-sm font-semibold text-sage-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
              >
                {quantityOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex items-baseline justify-between border-t border-sage-100 pt-3">
              <span className="text-sm text-sage-600">סך הכל לתשלום</span>
              <span className="text-2xl font-bold text-sage-900">
                ₪{totalPrice.toLocaleString("he-IL")}
              </span>
            </div>
          </div>

          {/* ════ Cancellation policy disclosure ════ */}
          <div className="rounded-2xl border border-sage-200 bg-sage-50 p-4 text-sm leading-relaxed text-sage-700">
            <p className="font-bold text-sage-900 mb-2">תנאי ביטול והחזר כספי</p>
            <ul className="list-disc pr-5 space-y-1.5 text-[13px] text-sage-600">
              <li>
                ביטול <strong>עד 14 ימים לפני</strong> מועד הסדנה — החזר כספי
                מלא של ₪{totalPrice.toLocaleString("he-IL")}.
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
                `אישור ותשלום ₪${totalPrice.toLocaleString("he-IL")}`
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
