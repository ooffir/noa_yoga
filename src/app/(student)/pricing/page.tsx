import { prisma } from "@/lib/prisma";
import { PricingCards } from "@/components/pricing/pricing-cards";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "מחירון יוגה בחיפה — שיעור בודד וכרטיסיות",
  description:
    "מחירי שיעורי יוגה בחיפה אצל נועה אופיר. שיעור בודד, כרטיסיית 5 או 10 שיעורים, תשלום מאובטח בפיימי. ביטול חינם בתוך חלון הזמן.",
  keywords: ["מחירון יוגה", "כרטיסיית יוגה", "יוגה בחיפה מחיר", "שיעור יוגה בודד"],
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "מחירון יוגה בחיפה | Noa Yogis",
    description:
      "שיעור בודד או כרטיסייה משתלמת של 5/10 שיעורים — בחרו את המסלול שמתאים לתרגול שלכם.",
    url: "/pricing",
    type: "website",
    images: [{ url: "/yoga-pose.png", width: 1200, height: 630, alt: "מחירון Noa Yogis" }],
  },
};

export default async function PricingPage() {
  let creditPrice = 50;
  let punchCard5Price = 200;
  let punchCardPrice = 350;
  let cancellationHours = 6;

  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: "main" },
      select: {
        creditPrice: true,
        punchCard5Price: true,
        punchCardPrice: true,
        cancellationWindow: true,
      },
    });
    if (settings) {
      creditPrice = settings.creditPrice;
      punchCard5Price = settings.punchCard5Price;
      punchCardPrice = settings.punchCardPrice;
      cancellationHours = settings.cancellationWindow;
    }
  } catch {}

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-sage-900">מחירון</h1>
        <p className="mt-2 text-sage-500">בחרו את המסלול שמתאים לתרגול שלכם</p>
      </div>
      <PricingCards
        creditPrice={creditPrice}
        punchCard5Price={punchCard5Price}
        punchCardPrice={punchCardPrice}
        cancellationHours={cancellationHours}
      />
    </div>
  );
}
