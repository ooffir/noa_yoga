"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Ticket, Sparkles, ArrowLeft } from "lucide-react";
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
  punchCardPrice: number;
}

export function BookChoiceDialog({
  open,
  onOpenChange,
  classInstanceId,
  classTitle,
  creditPrice,
  punchCardPrice,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);

  const loading = pending || redirecting;

  const handleSingleClass = () => {
    startTransition(async () => {
      const result = await generatePaymeSaleForCredits(
        "SINGLE_CLASS",
        classInstanceId,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("מעבירים לדף התשלום…");
      setRedirecting(true);
      window.location.href = result.url;
    });
  };

  const handlePunchCard = () => {
    toast("מעבירים לאזור האישי לרכישת כרטיסייה…", { icon: "🎟️" });
    router.push("/profile#credits");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="mb-5">
          <DialogTitle className="text-xl text-sage-900">איך תרצו לשלם?</DialogTitle>
          <DialogDescription>
            {classTitle ? `הרשמה לשיעור "${classTitle}"` : "אין לכם עדיין יתרת שיעורים."} אפשר לבחור בין תשלום חד פעמי לשיעור הזה, או לרכוש כרטיסייה שתשרת אתכם לעשרה שיעורים הבאים.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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

          <button
            type="button"
            onClick={handlePunchCard}
            disabled={loading}
            className="group flex w-full items-center justify-between rounded-3xl border-2 border-sage-200 bg-gradient-to-bl from-sage-50 to-white p-5 text-right transition-all hover:border-sage-400 hover:from-sage-100 active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage-600 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-sage-900">כרטיסייה של 10 שיעורים</p>
                <p className="text-xs text-sage-500">המשתלם ביותר — מועבר/ת לאזור האישי</p>
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
