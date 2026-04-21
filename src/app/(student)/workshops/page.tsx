import { prisma } from "@/lib/prisma";
import { Sparkles, CalendarDays, Clock, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { WorkshopRegisterButton } from "@/components/workshops/register-button";
import {
  completeWorkshopSuccess,
  cancelWorkshop,
  isPaymeSuccess,
  isPaymeFailure,
} from "@/lib/payments";

// Always read fresh payment state from the DB so the confirmation banner
// reflects the webhook update immediately after redirect.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkshopRow = Awaited<ReturnType<typeof prisma.workshop.findMany>>[number] & {
  _count: { registrations: number };
};

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function WorkshopsPage({ searchParams }: Props) {
  const sp = await searchParams;

  // ─── Self-healing: if PayMe redirected back with a registration id AND
  // signals success/failure, reconcile the DB here so the user always sees
  // the correct banner on first render (no webhook race).
  if (sp.registration) {
    try {
      if (isPaymeSuccess({
        payme_status: sp.payme_status,
        status: sp.status,
        status_code: sp.status_code,
      })) {
        await completeWorkshopSuccess(sp.registration);
      } else if (
        sp.cancelled === "true" ||
        isPaymeFailure({ payme_status: sp.payme_status, status: sp.status })
      ) {
        await cancelWorkshop(sp.registration);
      }
    } catch (err) {
      console.error("[workshops] self-heal error:", err);
    }
  }

  let workshops: WorkshopRow[] = [];
  try {
    workshops = await prisma.workshop.findMany({
      where: { isActive: true, date: { gte: new Date() } },
      orderBy: { date: "asc" },
      include: { _count: { select: { registrations: { where: { paymentStatus: { not: "CANCELLED" } } } } } },
    });
  } catch (err) {
    console.error("[workshops] DB unreachable, rendering empty state:", err instanceof Error ? err.message : err);
  }

  // Resolve the post-payment banner — we look up the registration directly
  // instead of trusting the `success=true` query string, so spoofed URLs
  // can't show a false confirmation.
  let banner: { kind: "success" | "pending" | "cancelled"; title: string } | null = null;
  if (sp.registration) {
    try {
      const reg = await prisma.workshopRegistration.findUnique({
        where: { id: sp.registration },
        include: { workshop: { select: { title: true } } },
      });
      if (reg) {
        if (reg.paymentStatus === "COMPLETED") {
          banner = { kind: "success", title: reg.workshop.title };
        } else if (reg.paymentStatus === "PENDING") {
          banner = { kind: "pending", title: reg.workshop.title };
        } else {
          banner = { kind: "cancelled", title: reg.workshop.title };
        }
      }
    } catch {}
  } else if (sp.cancelled === "true") {
    banner = { kind: "cancelled", title: "" };
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      {banner?.kind === "success" && (
        <div className="mb-8 flex items-start gap-3 rounded-3xl border border-green-200 bg-green-50 p-5">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
          <div>
            <p className="font-bold text-green-900">ההרשמה הושלמה!</p>
            <p className="mt-1 text-sm text-green-700">
              התשלום על &quot;{banner.title}&quot; התקבל. נשלח אליכם מייל עם כל הפרטים.
            </p>
          </div>
        </div>
      )}

      {banner?.kind === "pending" && (
        <div className="mb-8 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <Clock3 className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold text-amber-900">התשלום בעיבוד</p>
            <p className="mt-1 text-sm text-amber-700">
              הרישום ל&quot;{banner.title}&quot; יאושר ברגע שנקבל עדכון מחברת הסליקה. ניתן לרענן בעוד כמה שניות.
            </p>
          </div>
        </div>
      )}

      {banner?.kind === "cancelled" && (
        <div className="mb-8 flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-5">
          <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
          <div>
            <p className="font-bold text-red-900">התשלום בוטל</p>
            <p className="mt-1 text-sm text-red-700">
              לא חויבתם. ניתן לנסות שוב מתי שתרצו.
            </p>
          </div>
        </div>
      )}

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
