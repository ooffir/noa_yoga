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
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loading";

interface PendingPayment {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  amount: number;
  type: "SINGLE_CLASS" | "PUNCH_CARD";
  createdAt: string;
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

export function PendingPaymentsView() {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [registrations, setRegistrations] = useState<PendingRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/payments/pending");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setPayments(data.payments || []);
      setRegistrations(data.registrations || []);
    } catch {
      toast.error("טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      await load();
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
      await load();
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
      await load();
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
      await load();
    } catch {
      toast.error("דחייה נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  const rejectAll = async () => {
    const total = payments.length + registrations.length;
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
      await load();
    } catch {
      toast.error("הניקוי נכשל");
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-sage-100 bg-white p-10 text-center">
        <Spinner className="mx-auto h-6 w-6" />
      </div>
    );
  }

  const total = payments.length + registrations.length;

  return (
    <div className="space-y-6">
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
              onClick={rejectAll}
              disabled={bulkBusy}
              className="rounded-2xl gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            >
              {bulkBusy ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              ניקוי כל התקועים
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load} className="rounded-2xl gap-2">
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
                          {p.userEmail} · {p.type === "PUNCH_CARD" ? "כרטיסיית 10" : "שיעור בודד"}{" "}
                          · ₪{(p.amount / 100).toFixed(2)} ·{" "}
                          {format(new Date(p.createdAt), "d בMMMM HH:mm", { locale: he })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => completePayment(p.id)}
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
                          onClick={() => rejectPayment(p.id)}
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
                          onClick={() => completeRegistration(r.id)}
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
                          onClick={() => rejectRegistration(r.id)}
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
