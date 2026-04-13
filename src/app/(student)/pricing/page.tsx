import { prisma } from "@/lib/prisma";
import { PricingCards } from "@/components/pricing/pricing-cards";

export const revalidate = 60;

export default async function PricingPage() {
  let creditPrice = 50;
  let punchCardPrice = 350;

  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: "main" },
      select: { creditPrice: true, punchCardPrice: true },
    });
    if (settings) {
      creditPrice = settings.creditPrice;
      punchCardPrice = settings.punchCardPrice;
    }
  } catch {}

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-sage-900">מחירון</h1>
        <p className="mt-2 text-sage-500">בחרו את המסלול שמתאים לתרגול שלכם</p>
      </div>
      <PricingCards creditPrice={creditPrice} punchCardPrice={punchCardPrice} />
    </div>
  );
}
