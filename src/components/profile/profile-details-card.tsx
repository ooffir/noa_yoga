"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";
import { User as UserIcon, Phone, Mail, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { isNameValid, isPhoneValid } from "@/lib/profile-validation";

/**
 * Inline editor for the user's own name + phone, rendered on
 * `/profile`. Uses the same PATCH /api/user/profile endpoint as the
 * gate modal — single source of truth.
 *
 * Email is shown read-only because Clerk owns it; changing email
 * requires a Clerk-side flow with verification, out of scope here.
 */

interface ProfileDetailsCardProps {
  initialName: string;
  initialPhone: string;
  email: string;
}

export function ProfileDetailsCard({
  initialName,
  initialPhone,
  email,
}: ProfileDetailsCardProps) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = name !== initialName || phone !== initialPhone;
  const nameOk = isNameValid(name);
  const phoneOk = phone === "" || isPhoneValid(phone); // phone optional when blanking? no — required for booking
  const canSave = dirty && nameOk && isPhoneValid(phone) && !saving;

  const onSubmit = async (e: React.FormEvent) => {
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
      toast.success("הפרטים נשמרו");
      setSavedAt(Date.now());
    } catch (err) {
      console.error("[profile-details] save failed:", err);
      toast.error("שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-sage-600" />
          פרטים אישיים
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">
              שם מלא
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="הזיני את שמך"
              autoComplete="name"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-sage-400" />
              טלפון
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="050-1234567"
              autoComplete="tel"
              dir="ltr"
            />
            <p className="mt-1 text-[11px] text-sage-400">
              נשתמש בטלפון רק לתיאום במקרה של ביטול שיעור או חרום.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-sage-400" />
              אימייל
            </label>
            <Input
              value={email}
              readOnly
              disabled
              dir="ltr"
              className="bg-sage-50/50 text-sage-500"
            />
            <p className="mt-1 text-[11px] text-sage-400">
              לעדכון אימייל יש לפנות אלינו.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="text-[11px] text-sage-400">
              {savedAt && !dirty && (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  נשמר
                </span>
              )}
            </div>
            <Button type="submit" className="rounded-2xl" disabled={!canSave}>
              {saving ? <Spinner className="h-4 w-4" /> : "שמירה"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
