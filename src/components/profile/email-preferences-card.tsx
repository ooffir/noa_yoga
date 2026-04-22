"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Bell, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

interface Props {
  initialValue: boolean;
}

/**
 * Client-side toggle card that calls PATCH /api/user/preferences.
 * Optimistic update: flip the UI immediately, roll back only if the API fails.
 */
export function EmailPreferencesCard({ initialValue }: Props) {
  const [receiveEmails, setReceiveEmails] = useState(initialValue);
  const [, startTransition] = useTransition();

  const handleToggle = (next: boolean) => {
    const previous = receiveEmails;
    setReceiveEmails(next); // optimistic

    startTransition(async () => {
      try {
        const res = await fetch("/api/user/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiveEmails: next }),
        });
        if (!res.ok) throw new Error("save failed");
        toast.success(
          next ? "תקבלי מיילים מ-Noa Yogis" : "העדפות נשמרו — לא נשלח יותר מיילים",
        );
      } catch {
        setReceiveEmails(previous); // roll back
        toast.error("שמירה נכשלה, נסי שוב");
      }
    });
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-sage-600" />
          העדפות תקשורת
        </CardTitle>
      </CardHeader>
      <CardContent>
        <label
          htmlFor="receive-emails-toggle"
          className="flex items-start justify-between gap-4 cursor-pointer"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sage-900">
              אני מעוניין/ת לקבל תזכורות ועדכונים למייל
            </p>
            <p className="mt-1 text-xs text-sage-500 leading-relaxed">
              כולל אישורי הרשמה לשיעורים, הודעות על מעבר מרשימת המתנה ותזכורות
              יום לפני שיעור. ניתן לשנות בכל עת.
            </p>
          </div>
          <Switch
            id="receive-emails-toggle"
            checked={receiveEmails}
            onCheckedChange={handleToggle}
            aria-label="קבלת מיילים"
          />
        </label>

        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-sage-50 p-3 text-xs leading-relaxed text-sage-600">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-sage-500" />
          <span>
            אישורי תשלום וקבלות נשלחים תמיד, גם כשהכיבית את האפשרות הזו —
            זו חובה לפי חוק הגנת הצרכן.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
