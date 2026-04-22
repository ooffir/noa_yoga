import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ProfileView } from "@/components/profile/profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const dbUser = await requireAuth();

  const [upcomingBookings, pastBookings, punchCards, settings] = await Promise.all([
    prisma.booking.findMany({
      where: {
        userId: dbUser.id,
        status: "CONFIRMED",
        classInstance: { date: { gte: new Date() } },
      },
      include: { classInstance: { include: { classDefinition: true } } },
      orderBy: { classInstance: { date: "asc" } },
    }),
    prisma.booking.findMany({
      where: {
        userId: dbUser.id,
        classInstance: { date: { lt: new Date() } },
      },
      include: { classInstance: { include: { classDefinition: true } } },
      orderBy: { classInstance: { date: "desc" } },
      take: 20,
    }),
    prisma.punchCard.findMany({
      where: { userId: dbUser.id, status: "ACTIVE" },
      orderBy: { purchasedAt: "asc" },
    }),
    prisma.siteSettings.findUnique({
      where: { id: "main" },
      select: { cancellationWindow: true },
    }).catch(() => null),
  ]);

  const punchCardCredits = punchCards.reduce((sum, pc) => sum + pc.remainingCredits, 0);
  const totalCredits = dbUser.credits + punchCardCredits;
  const cancellationHoursBefore = settings?.cancellationWindow ?? 6;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-2xl font-bold text-sage-900 mb-6">האזור האישי</h1>
      <ProfileView
        user={{ name: dbUser.name || "", email: dbUser.email }}
        upcomingBookings={JSON.parse(JSON.stringify(upcomingBookings))}
        pastBookings={JSON.parse(JSON.stringify(pastBookings))}
        totalCredits={totalCredits}
        directCredits={dbUser.credits}
        punchCardCredits={punchCardCredits}
        punchCards={JSON.parse(JSON.stringify(punchCards))}
        cancellationHoursBefore={cancellationHoursBefore}
        receiveEmails={dbUser.receiveEmails ?? true}
      />
    </div>
  );
}
