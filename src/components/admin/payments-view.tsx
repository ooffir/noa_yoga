"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Ticket,
  Sparkles,
  X,
  Trash2,
  History,
  Clock3,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
interface PendingPayment {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  amount: number;
  type: "SINGLE_CLASS" | "PUNCH_CARD_5" | "PUNCH_CARD";
  createdAt: string;
}

// Import the shared short-label helper so the admin tables always stay in
// sync with the pricing page + receipt emails. (Kept as a dynamic import
// alternative shape to avoid an extra top-level import for one helper.)
function shortLabel(type: string): string {
  if (type === "PUNCH_CARD") return "כרטיסיית 10";
  if (type === "PUNCH_CARD_5") return "כרטיסיית 5";
  return "שיעור בודד";
}

interface PendingRegistration {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  workshopTitle: string;
  workshopPrice: number;
  createdAt: string;
}

interface CompletedEntry {
  kind: "payment" | "workshop";
  id: string;
  userName: string | null;
  userEmail: string;
  productLabel: string;
  amountIls: number;
  at: string;
}

type Tab = "pending" | "completed";

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────
export function PaymentsView() {
  const [tab, setTab] = useState<Tab>("pending");

  // Pending state
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(true);

  // Completed state
  const [completed, setCompleted] = useState<CompletedEntry[]>([]);
  const [completedLoaded, setCompletedLoaded] = useState(false);
  const [completedLoading, setCompletedLoading] = useState(false);

  // Per-row busy flags
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // ──────── Data loaders ────────
  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await fetch("/api/admin/payments/pending");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setPendingPayments(data.payments || []);
      setPendingRegistrations(data.registrations || []);
      setPendingLoaded(true);
    } catch {
      toast.error("טעינת התשלומים התקועים נכשלה");
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadCompleted = useCallback(async () => {
    setCompletedLoading(true);
    try {
      const res = await fetch("/api/admin/payments/completed?limit=200");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setCompleted(data.entries || []);
      setCompletedLoaded(true);
    } catch {
      toast.error("טעינת היסטוריית התשלומים נכשלה");
    } finally {
      setCompletedLoading(false);
    }
  }, []);

  // Load pending immediately on mount.
  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // Lazy-load completed the first time the tab is activated.
  useEffect(() => {
    if (tab === "completed" && !completedLoaded && !completedLoading) {
      loadCompleted();
    }
  }, [tab, completedLoaded, completedLoading, loadCompleted]);

  // ──────── Row actions ────────
  const completePayment = async (id: string) => {
    if (!confirm("לאשר את התשלום ולהוסיף את הקרדיטים למשתמש/ת?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/payments/${id}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "פעולה נכשלה");
        return;
      }
      toast.success(
        data.status === "already_completed"
          ? "התשלום כבר היה מאושר"
          : `אושר + נוספו ${data.credits} קרדיטים`,
      );
      await Promise.all([loadPending(), completedLoaded ? loadCompleted() : null]);
    } catch {
      toast.error("פעולה נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  const rejectPayment = async (id: string) => {
    if (!confirm("לסמן את התשלום כנכשל ולהסירו מהרשימה?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/payments/${id}/reject`, { method: "POST" });
      if (!res.ok) {
        toast.error("דחייה נכשלה");
        return;
      }
      toast.success("התשלום סומן כנכשל");
      await loadPending();
    } catch {
      toast.error("דחייה נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  const completeRegistration = async (id: string) => {
    if (!confirm("לאשר את הרישום לסדנה?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/workshop-registrations/${id}/complete`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "פעולה נכשלה");
        return;
      }
      toast.success("ההרשמה לסדנה אושרה");
      await Promise.all([loadPending(), completedLoaded ? loadCompleted() : null]);
    } catch {
      toast.error("פעולה נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  const rejectRegistration = async (id: string) => {
    if (!confirm("לבטל את הרישום הזה?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/workshop-registrations/${id}/reject`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("דחייה נכשלה");
        return;
      }
      toast.success("הרישום בוטל");
      await loadPending();
    } catch {
      toast.error("דחייה נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  const rejectAll = async () => {
    const total = pendingPayments.length + pendingRegistrations.length;
    if (total === 0) return;
    if (
      !confirm(
        `לנקות את כל ${total} התשלומים והרישומים התקועים? פעולה זו תסמן את כולם כנכשלים.`,
      )
    )
      return;

    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/payments/reject-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error("הניקוי נכשל");
        return;
      }
      toast.success(
        `נוקו: ${data.payments} תשלומים, ${data.registrations} רישומי סדנאות`,
      );
      await loadPending();
    } catch {
      toast.error("הניקוי נכשל");
    } finally {
      setBulkBusy(false);
    }
  };

  const pendingTotal = pendingPayments.length + pendingRegistrations.length;

  // ──────── Render ────────
  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div
        role="tablist"
        aria-label="מצב התשלומים"
        className="flex items-center gap-1 rounded-3xl border border-sage-100 bg-white p-1"
      >
        <TabButton
          active={tab === "pending"}
          onClick={() => setTab("pending")}
          icon={<Clock3 className="h-4 w-4" />}
          label="תשלומים תקועים"
          count={pendingLoaded ? pendingTotal : null}
        />
        <TabButton
          active={tab === "completed"}
          onClick={() => setTab("completed")}
          icon={<History className="h-4 w-4" />}
          label="היסטוריית תשלומים"
          count={completedLoaded ? completed.length : null}
        />
      </div>

      {tab === "pending" ? (
        <PendingSection
          loading={pendingLoading}
          payments={pendingPayments}
          registrations={pendingRegistrations}
          bulkBusy={bulkBusy}
          busyId={busyId}
          onRefresh={loadPending}
          onCompletePayment={completePayment}
          onRejectPayment={rejectPayment}
          onCompleteRegistration={completeRegistration}
          onRejectRegistration={rejectRegistration}
          onRejectAll={rejectAll}
        />
      ) : (
        <CompletedSection
          loading={completedLoading}
          entries={completed}
          onRefresh={loadCompleted}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tab button
// ─────────────────────────────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number | null;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sage-600 text-white shadow-sm"
          : "bg-transparent text-sage-600 hover:bg-sage-50",
      )}
    >
      {icon}
      <span>{label}</span>
      {count !== null && count > 0 && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            active ? "bg-white/20 text-white" : "bg-sage-100 text-sage-700",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pending tab
// ─────────────────────────────────────────────────────────────────────────────
function PendingSection(props: {
  loading: boolean;
  payments: PendingPayment[];
  registrations: PendingRegistration[];
  bulkBusy: boolean;
  busyId: string | null;
  onRefresh: () => void;
  onCompletePayment: (id: string) => void;
  onRejectPayment: (id: string) => void;
  onCompleteRegistration: (id: string) => void;
  onRejectRegistration: (id: string) => void;
  onRejectAll: () => void;
}) {
  const {
    loading,
    payments,
    registrations,
    bulkBusy,
    busyId,
    onRefresh,
    onCompletePayment,
    onRejectPayment,
    onCompleteRegistration,
    onRejectRegistration,
    onRejectAll,
  } = props;

  if (loading) {
    return (
      <div className="rounded-3xl border border-sage-100 bg-white p-10 text-center">
        <Spinner className="mx-auto h-6 w-6" />
      </div>
    );
  }

  const total = payments.length + registrations.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sage-600">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <span className="text-sm font-medium">{total} פריטים ממתינים</span>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRejectAll}
              disabled={bulkBusy}
              className="rounded-2xl gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            >
              {bulkBusy ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              ניקוי כל התקועים
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh} className="rounded-2xl gap-2">
            <RefreshCw className="h-4 w-4" />
            רענון
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="py-14 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
            <p className="text-lg font-medium text-sage-700">הכל מסודר — אין תשלומים תקועים</p>
            <p className="mt-1 text-sm text-sage-400">
              כל התשלומים וההרשמות לסדנאות מעודכנים.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {payments.length > 0 && (
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="h-5 w-5 text-sage-600" />
                  תשלומי קרדיטים / כרטיסייה ({payments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-sage-100">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sage-900 text-sm truncate">
                          {p.userName || p.userEmail}
                        </p>
                        <p className="text-xs text-sage-500 truncate">
                          {p.userEmail} · {shortLabel(p.type)} · ₪{(p.amount / 100).toFixed(2)} ·{" "}
                          {format(new Date(p.createdAt), "d בMMMM HH:mm", { locale: he })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => onCompletePayment(p.id)}
                          disabled={busyId !== null}
                          className="rounded-2xl gap-2"
                        >
                          {busyId === p.id ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              אישור + הוספת קרדיטים
                            </>
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => onRejectPayment(p.id)}
                          disabled={busyId !== null}
                          className="h-9 w-9 rounded-2xl border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300"
                          title="סמן כנכשל"
                        >
                          {busyId === p.id ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {registrations.length > 0 && (
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-sage-600" />
                  הרשמות לסדנאות ({registrations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-sage-100">
                  {registrations.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sage-900 text-sm truncate">
                          {r.userName || r.userEmail}
                        </p>
                        <p className="text-xs text-sage-500 truncate">
                          {r.userEmail} · {r.workshopTitle} · ₪{r.workshopPrice} ·{" "}
                          {format(new Date(r.createdAt), "d בMMMM HH:mm", { locale: he })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => onCompleteRegistration(r.id)}
                          disabled={busyId !== null}
                          className="rounded-2xl gap-2"
                        >
                          {busyId === r.id ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              אישור רישום
                            </>
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => onRejectRegistration(r.id)}
                          disabled={busyId !== null}
                          className="h-9 w-9 rounded-2xl border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300"
                          title="בטל רישום"
                        >
                          {busyId === r.id ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Completed tab
// ─────────────────────────────────────────────────────────────────────────────
function CompletedSection({
  loading,
  entries,
  onRefresh,
}: {
  loading: boolean;
  entries: CompletedEntry[];
  onRefresh: () => void;
}) {
  const totalIls = entries.reduce((s, e) => s + e.amountIls, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sage-600">
          <History className="h-5 w-5 text-sage-500" />
          <span className="text-sm font-medium">
            {loading ? "טוען…" : `${entries.length} תשלומים · סה״כ ₪${totalIls.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="rounded-2xl gap-2">
          <RefreshCw className="h-4 w-4" />
          רענון
        </Button>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-sage-100 bg-white p-10 text-center">
          <Spinner className="mx-auto h-6 w-6" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="py-14 text-center">
            <History className="mx-auto mb-3 h-10 w-10 text-sage-200" />
            <p className="text-lg font-medium text-sage-700">אין עדיין תשלומים שהושלמו</p>
            <p className="mt-1 text-sm text-sage-400">
              תשלומים שיבוצעו בהצלחה יופיעו כאן.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sage-100 bg-sage-50/50 text-right text-xs font-medium text-sage-500">
                    <th className="py-3 px-4">לקוח/ה</th>
                    <th className="py-3 px-4">מוצר</th>
                    <th className="py-3 px-4 text-left">סכום</th>
                    <th className="py-3 px-4">תאריך</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={`${e.kind}:${e.id}`}
                      className="border-b border-sage-50 last:border-b-0 hover:bg-sage-50/30"
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-sage-900 truncate max-w-[220px]">
                          {e.userName || "—"}
                        </p>
                        <p className="text-xs text-sage-500 truncate max-w-[220px]">
                          {e.userEmail}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            e.kind === "workshop"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-sage-50 text-sage-700",
                          )}
                        >
                          {e.kind === "workshop" ? (
                            <Sparkles className="h-3 w-3" />
                          ) : (
                            <Ticket className="h-3 w-3" />
                          )}
                          {e.productLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-left">
                        <span className="font-bold text-sage-800">
                          ₪{e.amountIls.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-sage-600">
                        {format(new Date(e.at), "d בMMMM yyyy · HH:mm", { locale: he })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
