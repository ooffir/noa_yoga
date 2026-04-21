"use client";

import { useState, useTransition } from "react";
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
  punchCardPrice: number;
}

export function PricingCards({ creditPrice, punchCardPrice }: Props) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [pendingType, setPendingType] = useState<CreditPurchaseType | null>(null);
  const [, startTransition] = useTransition();

  const savings = creditPrice * 10 - punchCardPrice;

  const plans = [
    {
      id: "SINGLE_CLASS",
      name: "שיעור בודד",
      price: creditPrice,
      description: "מתאים למי שרוצה לנסות",
      features: [
        "קרדיט לשיעור אחד",
        "הרשמה לכל שיעור פנוי",
        "ביטול חינם עד 6 שעות לפני",
      ],
      highlighted: false,
    },
    {
      id: "PUNCH_CARD",
      name: "כרטיסיית 10 שיעורים",
      price: punchCardPrice,
      description: "המשתלם ביותר למתרגלים קבועים",
      features: [
        "10 קרדיטים לשיעורים",
        "הרשמה לכל שיעור פנוי",
        "ביטול חינם עד 6 שעות לפני",
        ...(savings > 0 ? [`חיסכון של ₪${savings} לעומת שיעורים בודדים`] : []),
      ],
      highlighted: true,
    },
  ];

  const handlePurchase = (type: CreditPurchaseType) => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    setPendingType(type);
    startTransition(async () => {
      const result = await generatePaymeSaleForCredits(type);
      if (!result.ok) {
        toast.error(result.error);
        setPendingType(null);
        return;
      }
      toast.success("מעבירים לדף התשלום…");
      window.location.href = result.url;
      // keep pendingType set so the spinner stays during the redirect
    });
  };

  return (
    <div className="space-y-5">
      {plans.map((plan) => (
        <Card
          key={plan.id}
          className={cn(
            "relative overflow-hidden rounded-3xl transition-all",
            plan.highlighted && "border-sage-300 shadow-lg ring-1 ring-sage-200"
          )}
        >
          {plan.highlighted && (
            <div className="absolute top-0 left-0 right-0 bg-sage-600 text-white text-xs font-medium text-center py-1.5">
              הכי משתלם
            </div>
          )}
          <CardHeader className={cn(plan.highlighted && "pt-10")}>
            <CardTitle>{plan.name}</CardTitle>
            <p className="text-sm text-sage-500">{plan.description}</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-bold text-sage-800">₪{plan.price}</span>
            </div>
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
              onClick={() => handlePurchase(plan.id as CreditPurchaseType)}
              disabled={pendingType !== null}
            >
              {pendingType === plan.id ? <Spinner className="h-4 w-4" /> : "רכישה"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
