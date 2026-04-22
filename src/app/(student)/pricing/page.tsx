import { prisma } from "@/lib/prisma";
import { PricingCards } from "@/components/pricing/pricing-cards";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "מחירון",
  description:
    "מחירון Noa Yogis — שיעור בודד או כרטיסיית 10 שיעורים. תשלום מאובטח בפיימי, ביטול חינם בתוך חלון הזמן המוגדר.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "מחירון | Noa Yogis",
    description:
      "שיעור בודד או כרטיסייה משתלמת של 10 שיעורים — בחרו את המסלול שמתאים לתרגול שלכם.",
    url: "/pricing",
    type: "website",
    images: [{ url: "/yoga-pose.png", width: 1200, height: 630, alt: "מחירון Noa Yogis" }],
  },
};

export default async function PricingPage() {
  let creditPrice = 50;
  let punchCardPrice = 350;
  let cancellationHours = 6;

  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: "main" },
      select: {
        creditPrice: true,
        punchCardPrice: true,
        cancellationWindow: true,
      },
    });
    if (settings) {
      creditPrice = settings.creditPrice;
      punchCardPrice = settings.punchCardPrice;
      cancellationHours = settings.cancellationWindow;
    }
  } catch {}

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-sage-900">מחירון</h1>
        <p className="mt-2 text-sage-500">בחרו את המסלול שמתאים לתרגול שלכם</p>
      </div>
      <PricingCards
        creditPrice={creditPrice}
        punchCardPrice={punchCardPrice}
        cancellationHours={cancellationHours}
      />
    </div>
  );
}
