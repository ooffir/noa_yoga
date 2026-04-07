import { prisma } from "@/lib/prisma";
import { Sparkles, CalendarDays, Clock } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { WorkshopRegisterButton } from "@/components/workshops/register-button";

export const revalidate = 60;

export default async function WorkshopsPage() {
  const workshops = await prisma.workshop.findMany({
    where: { isActive: true, date: { gte: new Date() } },
    orderBy: { date: "asc" },
    include: { _count: { select: { registrations: { where: { paymentStatus: { not: "CANCELLED" } } } } } },
  });

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-sage-900">סדנאות</h1>
        <p className="mt-3 text-sm leading-relaxed text-sage-500">
          חוויות ייחודיות מעבר לתרגול היומיומי
        </p>
      </div>

      {workshops.length === 0 ? (
        <div className="rounded-3xl border border-sage-100 bg-white p-14 text-center shadow-sm">
          <Sparkles className="mx-auto mb-4 h-10 w-10 text-sage-200" />
          <p className="text-lg font-medium text-sage-500">אין סדנאות קרובות כרגע</p>
          <p className="mt-1 text-sm text-sage-400">עקבו אחרינו לעדכונים על סדנאות חדשות</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {workshops.map((workshop) => {
            const isFull = workshop.maxCapacity
              ? workshop._count.registrations >= workshop.maxCapacity
              : false;

            return (
              <div
                key={workshop.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-sage-100 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-video w-full overflow-hidden bg-sage-50">
                  {workshop.imageUrl ? (
                    <img
                      src={workshop.imageUrl}
                      alt={workshop.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Sparkles className="h-10 w-10 text-sage-200" />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-bold text-sage-900 mb-2">{workshop.title}</h2>

                  <div className="flex flex-wrap gap-3 text-xs text-sage-500 mb-3">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {format(new Date(workshop.date), "EEEE, d בMMMM yyyy", { locale: he })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(workshop.date), "HH:mm")}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-sage-500 mb-4 line-clamp-3 flex-1">
                    {workshop.description}
                  </p>

                  <div className="flex items-center justify-between pt-3 border-t border-sage-50">
                    <span className="text-xl font-bold text-sage-800">₪{workshop.price}</span>
                    {isFull ? (
                      <span className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600">
                        מלא
                      </span>
                    ) : (
                      <WorkshopRegisterButton workshopId={workshop.id} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
