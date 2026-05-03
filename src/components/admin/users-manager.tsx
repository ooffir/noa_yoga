"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageLoader, Spinner } from "@/components/ui/loading";
import {
  Search,
  Plus,
  Minus,
  CreditCard,
  History,
  Check,
  X,
  Calendar,
  Ticket,
  Pencil,
  Phone,
} from "lucide-react";
import toast from "react-hot-toast";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: "STUDENT" | "ADMIN";
  credits: number;
  directCredits: number;
  punchCardCredits: number;
  totalBookings: number;
}

// ─────────────────────────────────────────────────────────────────────
//  History drill-down shape (must match /api/admin/users/[id]/history)
// ─────────────────────────────────────────────────────────────────────
interface HistoryBooking {
  id: string;
  status: "CONFIRMED" | "CANCELLED" | "NO_SHOW";
  bookedAt: string;
  cancelledAt: string | null;
  attendedAt: string | null;
  creditRefunded: boolean;
  classTitle: string;
  instructor: string;
  date: string;
  startTime: string;
}

interface HistoryPunchCard {
  id: string;
  totalCredits: number;
  remainingCredits: number;
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED";
  purchasedAt: string;
}

interface HistoryPayload {
  user: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    role: "STUDENT" | "ADMIN";
    createdAt: string;
    directCredits: number;
    punchCardCredits: number;
    totalCredits: number;
    receiveEmails: boolean;
  };
  upcoming: HistoryBooking[];
  past: HistoryBooking[];
  punchCards: HistoryPunchCard[];
  summary: {
    upcomingCount: number;
    pastCount: number;
    attendedCount: number;
    cancelledCount: number;
  };
}

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // History dialog state
  const [historyUserId, setHistoryUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Edit-details dialog state — name + phone editor
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("שגיאה בטעינת משתמשים");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateCredits = async (userId: string, delta: number) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const newCredits = Math.max(0, user.directCredits + delta);
    setUpdatingId(userId);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, credits: newCredits }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  directCredits: newCredits,
                  credits: newCredits + u.punchCardCredits,
                }
              : u
          )
        );
        toast.success(`קרדיטים עודכנו: ${newCredits}`);
      }
    } catch {
      toast.error("עדכון נכשל");
    }
    setUpdatingId(null);
  };

  const setCreditsManually = async (userId: string, value: string) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 0) return;

    setUpdatingId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, credits: num }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, directCredits: num, credits: num + u.punchCardCredits }
              : u
          )
        );
      }
    } catch {
      toast.error("עדכון נכשל");
    }
    setUpdatingId(null);
  };

  const openHistory = useCallback(async (userId: string) => {
    setHistoryUserId(userId);
    setHistory(null);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/history`);
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as HistoryPayload;
      setHistory(data);
    } catch {
      toast.error("טעינת ההיסטוריה נכשלה");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openEdit = (u: UserRow) => {
    setEditUserId(u.id);
    setEditName(u.name || "");
    setEditPhone(u.phone || "");
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserId) return;

    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editUserId,
          name: editName.trim(),
          // Allow blanking via empty string — server treats it as a valid clear.
          phone: editPhone.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "עדכון נכשל");
        return;
      }
      toast.success("הפרטים עודכנו");
      // Reflect in local state without refetching the whole list.
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUserId
            ? {
                ...u,
                name: editName.trim() || null,
                phone: editPhone.trim() || null,
              }
            : u,
        ),
      );
      setEditUserId(null);
    } catch (err) {
      console.error("[users-manager] save details failed:", err);
      toast.error("עדכון נכשל");
    } finally {
      setEditSaving(false);
    }
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או אימייל..."
          className="pr-10"
        />
      </div>

      <p className="text-xs text-sage-400">
        רשימה של כל המשתמשים שנרשמו לאתר ({users.length}) — תלמידות +
        מנהלות. לחיצה על השם פותחת היסטוריית הזמנות מלאה.
      </p>

      {filtered.length === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="py-12 text-center text-sage-400">
            לא נמצאו משתמשים
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((user) => (
            <Card key={user.id} className="rounded-3xl">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Clickable name — opens history drawer */}
                      <button
                        type="button"
                        onClick={() => openHistory(user.id)}
                        className="font-bold text-sage-900 text-sm truncate hover:text-sage-600 hover:underline text-right"
                      >
                        {user.name || "ללא שם"}
                      </button>
                      {user.role === "ADMIN" && (
                        <span className="shrink-0 rounded-full border border-sage-300 bg-sage-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-700">
                          מנהלת
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-sage-500 truncate" dir="ltr">{user.email}</p>
                    {user.phone && (
                      <p className="text-xs text-sage-500 truncate" dir="ltr">
                        {user.phone}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-sage-400">
                      <span>{user.totalBookings} הזמנות</span>
                      {user.punchCardCredits > 0 && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" />
                          {user.punchCardCredits} כרטיסייה
                        </span>
                      )}
                      {!user.phone && (
                        <span className="flex items-center gap-1 text-amber-600">
                          ללא טלפון
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-sage-500 hover:text-sage-700"
                      onClick={() => openEdit(user)}
                      title="עריכת שם וטלפון"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-sage-500 hover:text-sage-700"
                      onClick={() => openHistory(user.id)}
                      title="היסטוריית הזמנות"
                    >
                      <History className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => updateCredits(user.id, -1)}
                      disabled={updatingId === user.id || user.directCredits <= 0}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>

                    <div className="text-center min-w-[3rem]">
                      <input
                        type="number"
                        min={0}
                        value={user.directCredits}
                        onChange={(e) => setCreditsManually(user.id, e.target.value)}
                        className="w-12 text-center text-lg font-bold text-sage-800 bg-transparent border-none focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <p className="text-[10px] text-sage-400 -mt-0.5">קרדיטים</p>
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => updateCredits(user.id, 1)}
                      disabled={updatingId === user.id}
                    >
                      {updatingId === user.id ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Edit details dialog (name + phone) ─── */}
      <Dialog
        open={editUserId !== null}
        onOpenChange={(open) => {
          if (!open) setEditUserId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>עריכת פרטי תלמידה</DialogTitle>
            <DialogDescription>
              עדכון שם ומספר טלפון. האימייל קשור לחשבון Clerk ולא ניתן לעריכה כאן.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">
                שם מלא
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="שם מלא"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-sage-400" />
                טלפון
              </label>
              <Input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="050-1234567"
                autoComplete="off"
                dir="ltr"
              />
              <p className="mt-1 text-[11px] text-sage-400">
                ניתן להשאיר ריק אם התלמידה לא רוצה לשתף.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditUserId(null)}
                disabled={editSaving}
                className="rounded-2xl"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={editSaving}
                className="rounded-2xl"
              >
                {editSaving ? <Spinner className="h-4 w-4" /> : "שמירה"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── History drawer ─── */}
      <Dialog
        open={historyUserId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryUserId(null);
            setHistory(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>היסטוריית הזמנות</DialogTitle>
            <DialogDescription>
              {history ? history.user.email : "טוען..."}
            </DialogDescription>
          </DialogHeader>

          {historyLoading || !history ? (
            <div className="py-12 text-center">
              <Spinner className="mx-auto h-6 w-6" />
            </div>
          ) : (
            <div className="space-y-5 mt-2">
              {/* Summary strip */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <SummaryTile label="קרדיטים" value={history.user.totalCredits} />
                <SummaryTile label="הקרובות" value={history.summary.upcomingCount} />
                <SummaryTile label="השתתפה" value={history.summary.attendedCount} />
                <SummaryTile label="ביטולים" value={history.summary.cancelledCount} />
              </div>

              {/* Active punch cards */}
              {history.punchCards.length > 0 && (
                <section>
                  <h4 className="text-sm font-bold text-sage-700 mb-2 flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-sage-500" />
                    כרטיסיות
                  </h4>
                  <div className="space-y-2">
                    {history.punchCards.map((pc) => (
                      <div
                        key={pc.id}
                        className="flex items-center justify-between rounded-2xl border border-sage-100 bg-sage-50/30 px-4 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-sage-900">
                            {pc.remainingCredits}/{pc.totalCredits} קרדיטים זמינים
                          </p>
                          <p className="text-[11px] text-sage-400">
                            נרכש{" "}
                            {format(new Date(pc.purchasedAt), "d בMMMM yyyy", {
                              locale: he,
                            })}
                          </p>
                        </div>
                        <PunchCardBadge status={pc.status} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Upcoming */}
              <section>
                <h4 className="text-sm font-bold text-sage-700 mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-500" />
                  שיעורים עתידיים
                </h4>
                {history.upcoming.length === 0 ? (
                  <p className="text-xs text-sage-400 italic py-2">אין הזמנות עתידיות</p>
                ) : (
                  <div className="space-y-2">
                    {history.upcoming.map((b) => (
                      <BookingRow key={b.id} b={b} />
                    ))}
                  </div>
                )}
              </section>

              {/* Past */}
              <section>
                <h4 className="text-sm font-bold text-sage-700 mb-2 flex items-center gap-2">
                  <History className="h-4 w-4 text-sage-400" />
                  היסטוריית שיעורים ({history.summary.pastCount})
                </h4>
                {history.past.length === 0 ? (
                  <p className="text-xs text-sage-400 italic py-2">עוד לא השתתפה בשיעורים</p>
                ) : (
                  <div className="space-y-2">
                    {history.past.slice(0, 20).map((b) => (
                      <BookingRow key={b.id} b={b} />
                    ))}
                    {history.past.length > 20 && (
                      <p className="text-[11px] text-sage-400 text-center pt-1">
                        מוצגות 20 רשומות אחרונות מתוך {history.past.length}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Small presentational helpers
// ─────────────────────────────────────────────────────────────────────

function SummaryTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-sage-50/50 px-2 py-3">
      <p className="text-lg font-bold text-sage-900">{value}</p>
      <p className="text-[10px] text-sage-500">{label}</p>
    </div>
  );
}

function PunchCardBadge({ status }: { status: HistoryPunchCard["status"] }) {
  const label =
    status === "ACTIVE" ? "פעילה" : status === "EXHAUSTED" ? "נוצלה" : "פקעה";
  const color =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-sage-50 text-sage-600 border-sage-200";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      {label}
    </span>
  );
}

function BookingRow({ b }: { b: HistoryBooking }) {
  const date = format(new Date(b.date), "EEE d בMMMM", { locale: he });

  let statusEl: React.ReactNode = null;
  if (b.status === "CANCELLED") {
    statusEl = (
      <span className="inline-flex items-center gap-1 text-[10px] text-red-500">
        <X className="h-3 w-3" />
        בוטל{b.creditRefunded ? " · הוחזר קרדיט" : " · ללא החזר"}
      </span>
    );
  } else if (b.attendedAt) {
    statusEl = (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
        <Check className="h-3 w-3" />
        נכחה
      </span>
    );
  } else if (b.status === "CONFIRMED") {
    statusEl = (
      <span className="inline-flex items-center gap-1 text-[10px] text-sage-500">
        רשומה
      </span>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-sage-100 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-sage-900 truncate">{b.classTitle}</p>
        <p className="text-[11px] text-sage-500">
          {date} · {b.startTime} · {b.instructor}
        </p>
      </div>
      <div className="shrink-0">{statusEl}</div>
    </div>
  );
}
