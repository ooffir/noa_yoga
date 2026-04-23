"use client";

import { useRef, useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loading";
import { cn } from "@/lib/utils";
import {
  generatePaymeSaleForCredits,
  type CreditPurchaseType,
} from "@/actions/payme";

interface Props {
  creditPrice: number;
  punchCard5Price: number;
  punchCardPrice: number; // 10-session card
  cancellationHours?: number;
}

export function PricingCards({
  creditPrice,
  punchCard5Price,
  punchCardPrice,
  cancellationHours = 6,
}: Props) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [pendingType, setPendingType] = useState<CreditPurchaseType | null>(null);
  const [, startTransition] = useTransition();
  // Synchronous guard — `useState` is batched/async, so two rapid clicks
  // could both fire the server action and create duplicate Payment rows.
  // `useRef.current` mutates immediately and blocks re-entry.
  const submittingRef = useRef(false);

  // ── Savings math, all computed from the three DB prices ──
  const savings5 = creditPrice * 5 - punchCard5Price;
  const savings10 = creditPrice * 10 - punchCardPrice;
  const perClass5 = Math.round(punchCard5Price / 5);
  const perClass10 = Math.round(punchCardPrice / 10);

  const plans: Array<{
    id: CreditPurchaseType;
    name: string;
    price: number;
    perClass?: number;
    description: string;
    features: string[];
    highlighted: boolean;
    badge?: string;
  }> = [
    {
      id: "SINGLE_CLASS",
      name: "שיעור בודד",
      price: creditPrice,
      description: "מתאים למי שרוצה לנסות",
      features: [
        "קרדיט לשיעור אחד",
        "הרשמה לכל שיעור פנוי",
        `ביטול חינם עד ${cancellationHours} שעות לפני`,
      ],
      highlighted: false,
    },
    {
      id: "PUNCH_CARD_5",
      name: "כרטיסיית 5 שיעורים",
      price: punchCard5Price,
      perClass: perClass5,
      description: "חצי מחויבות, אותם יתרונות",
      features: [
        "5 קרדיטים לשיעורים",
        "הרשמה לכל שיעור פנוי",
        `ביטול חינם עד ${cancellationHours} שעות לפני`,
        ...(savings5 > 0 ? [`חיסכון של ₪${savings5} לעומת שיעורים בודדים`] : []),
      ],
      highlighted: false,
    },
    {
      id: "PUNCH_CARD",
      name: "כרטיסיית 10 שיעורים",
      price: punchCardPrice,
      perClass: perClass10,
      description: "המשתלם ביותר למתרגלים קבועים",
      features: [
        "10 קרדיטים לשיעורים",
        "הרשמה לכל שיעור פנוי",
        `ביטול חינם עד ${cancellationHours} שעות לפני`,
        ...(savings10 > 0 ? [`חיסכון של ₪${savings10} לעומת שיעורים בודדים`] : []),
      ],
      highlighted: true,
      badge: "הכי משתלם",
    },
  ];

  const handlePurchase = (type: CreditPurchaseType) => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPendingType(type);

    startTransition(async () => {
      const result = await generatePaymeSaleForCredits(type);
      if (!result.ok) {
        toast.error(result.error);
        setPendingType(null);
        submittingRef.current = false;
        return;
      }
      toast.success("מעבירים לדף התשלום…");
      window.location.href = result.url;
    });
  };

  return (
    // Mobile: vertical stack. Desktop (≥ md): 3 equal-width columns.
    // Highlighted plan stays visually centered because it's the 3rd child
    // and CSS Grid auto-places items left-to-right (in RTL: right-to-left),
    // so the "הכי משתלם" card gets the leftmost column — same prominence
    // as on mobile where it's at the bottom.
    <div className="grid gap-5 md:grid-cols-3 md:gap-6 md:items-start">
      {plans.map((plan) => {
        const isPending = pendingType === plan.id;
        return (
          <Card
            key={plan.id}
            className={cn(
              "relative overflow-hidden rounded-3xl transition-all",
              plan.highlighted && "border-sage-300 shadow-lg ring-1 ring-sage-200 md:-translate-y-2",
            )}
          >
            {plan.badge && (
              <div className="absolute top-0 left-0 right-0 bg-sage-600 text-white text-xs font-medium text-center py-1.5">
                {plan.badge}
              </div>
            )}
            <CardHeader className={cn(plan.badge && "pt-10")}>
              <CardTitle>{plan.name}</CardTitle>
              <p className="text-sm text-sage-500">{plan.description}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-bold text-sage-800">₪{plan.price}</span>
              </div>
              {plan.perClass !== undefined && (
                <p className="mb-5 text-xs text-sage-500">
                  ₪{plan.perClass} לשיעור
                </p>
              )}
              {plan.perClass === undefined && <div className="mb-5" />}

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-sage-600">
                    <Check className="h-4 w-4 text-sage-500 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full rounded-2xl"
                variant={plan.highlighted ? "default" : "outline"}
                onClick={() => handlePurchase(plan.id)}
                disabled={pendingType !== null}
              >
                {isPending ? <Spinner className="h-4 w-4" /> : "רכישה"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
