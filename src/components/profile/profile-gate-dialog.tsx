"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";
import toast from "react-hot-toast";
import { isNameValid, isPhoneValid } from "@/lib/profile-validation";

/**
 * Profile-completion modal — opens automatically when the parent
 * component triggers it via the `open` prop. On successful save it:
 *   1. Calls `onSaved(updatedUser)` so the parent can update local state.
 *   2. Closes itself.
 *
 * The parent is expected to then continue with the original action
 * (booking, payment, registration, etc.) that was blocked.
 *
 * Used in three places:
 *   - Schedule page → before booking a class
 *   - Pricing page  → before purchasing credits / punch card
 *   - Workshops page → before registering for a workshop
 */

interface ProfileGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string | null;
  initialPhone?: string | null;
  /** Called after a successful save with the new values. */
  onSaved?: (user: { name: string; phone: string }) => void;
  /** Optional extra context shown above the form. */
  contextMessage?: string;
}

export function ProfileGateDialog({
  open,
  onOpenChange,
  initialName,
  initialPhone,
  onSaved,
  contextMessage,
}: ProfileGateDialogProps) {
  const [name, setName] = useState(initialName ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);

  // Reset when reopened with different defaults (e.g. user filled name
  // but not phone last time, then closed; reopen should pre-fill the
  // saved name).
  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setPhone(initialPhone ?? "");
    }
  }, [open, initialName, initialPhone]);

  const nameOk = isNameValid(name);
  const phoneOk = isPhoneValid(phone);
  const canSave = nameOk && phoneOk && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "שמירה נכשלה");
        return;
      }
      toast.success("פרטי הפרופיל נשמרו");
      onSaved?.({ name: name.trim(), phone: phone.trim() });
      onOpenChange(false);
    } catch (err) {
      console.error("[profile-gate] save failed:", err);
      toast.error("שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>השלמת פרטי פרופיל</DialogTitle>
          <DialogDescription>
            {contextMessage ||
              "כדי להמשיך, נשמח אם תעדכני את שמך ומספר הטלפון. הפרטים נשמרים אצלנו ולא נשלחים אף פעם החוצה."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">
              שם מלא
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: נועה אופיר"
              autoFocus
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">
              מספר טלפון
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="050-1234567"
              autoComplete="tel"
              dir="ltr"
              required
            />
            <p className="mt-1 text-[11px] text-sage-400">
              נשתמש רק לתיאום במקרה של ביטול שיעור או חרום.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl"
            disabled={!canSave}
          >
            {saving ? <Spinner className="h-4 w-4" /> : "שמירה והמשך"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
