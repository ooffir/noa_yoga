import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth-helpers";
import { PendingPaymentsView } from "@/components/admin/pending-payments-view";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-sage-900">תשלומים תקועים</h1>
        <p className="mt-1 text-sm text-sage-500">
          רשימת תשלומים ורישומים שממתינים לאישור מחברת הסליקה. במקרה שה-webhook
          לא הגיע, ניתן לאשר ידנית — המערכת תוסיף את הקרדיטים או תאשר את ההרשמה.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="rounded-3xl border border-sage-100 bg-white p-10 text-center text-sage-400">
            טוען…
          </div>
        }
      >
        <PendingPaymentsView />
      </Suspense>
    </div>
  );
}
