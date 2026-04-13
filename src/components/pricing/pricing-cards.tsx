"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

interface Props {
  creditPrice: number;
  punchCardPrice: number;
}

export function PricingCards({ creditPrice, punchCardPrice }: Props) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

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

  const handlePurchase = async (type: string) => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    setLoading(type);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "הרכישה נכשלה"); return; }
      window.location.href = data.url;
    } catch {
      toast.error("משהו השתבש, נסו שוב");
    } finally {
      setLoading(null);
    }
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
              onClick={() => handlePurchase(plan.id)}
              disabled={loading !== null}
            >
              {loading === plan.id ? <Spinner className="h-4 w-4" /> : "רכישה"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
