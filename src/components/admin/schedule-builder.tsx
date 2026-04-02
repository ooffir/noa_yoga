"use client";

import { useState, useEffect, useCallback } from "react";
import { format, addWeeks, startOfWeek } from "date-fns";
import { he } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, Users, Clock, Trash2, MapPin,
  Pencil, X, RotateCcw, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { PageLoader, Spinner } from "@/components/ui/loading";
import toast from "react-hot-toast";

interface AdminClass {
  id: string;
  classDefId: string;
  title: string;
  instructor: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
  maxCapacity: number;
  currentBookings: number;
  isCancelled: boolean;
  isRecurring: boolean;
  bookings: { user: { id: string; name: string; email: string } }[];
  waitlist: { user: { id: string; name: string; email: string } }[];
}

const DAYS_HE: Record<string, string> = {
  SUNDAY: "ראשון",
  MONDAY: "שני",
  TUESDAY: "שלישי",
  WEDNESDAY: "רביעי",
  THURSDAY: "חמישי",
  FRIDAY: "שישי",
  SATURDAY: "שבת",
};

const DAYS_OF_WEEK = Object.keys(DAYS_HE);

function getDayOfWeekFromDate(dateStr: string): string {
  if (!dateStr) return "SUNDAY";
  const d = new Date(dateStr + "T00:00:00Z");
  return DAYS_OF_WEEK[d.getUTCDay()] || "SUNDAY";
}

function getDefaultDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface FormState {
  title: string;
  description: string;
  instructor: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  location: string;
  date: string;
  isRecurring: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  instructor: "",
  startTime: "09:00",
  endTime: "10:00",
  maxCapacity: 15,
  location: "",
  date: getDefaultDate(),
  isRecurring: true,
};

export function ScheduleBuilder() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [editDefId, setEditDefId] = useState<string | null>(null);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/schedule?week=${weekOffset}`);
      const data = await res.json();
      setClasses(Array.isArray(data) ? data : []);
    } catch {
      toast.error("שגיאה בטעינת מערכת השעות");
    }
    setLoading(false);
  }, [weekOffset]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    const dayOfWeek = getDayOfWeekFromDate(form.date);

    try {
      const res = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          instructor: form.instructor,
          dayOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          maxCapacity: Number(form.maxCapacity),
          location: form.location || undefined,
          date: form.date,
          isRecurring: form.isRecurring,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "יצירת השיעור נכשלה");
        return;
      }

      toast.success(form.isRecurring ? "שיעור קבוע נוצר (12 שבועות)" : "שיעור חד-פעמי נוצר");
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      fetchSchedule();
    } catch {
      toast.error("יצירת השיעור נכשלה");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (cls: AdminClass) => {
    setEditDefId(cls.classDefId);
    setForm({
      title: cls.title,
      description: "",
      instructor: cls.instructor,
      startTime: cls.startTime,
      endTime: cls.endTime,
      maxCapacity: cls.maxCapacity,
      location: cls.location || "",
      date: format(new Date(cls.date), "yyyy-MM-dd"),
      isRecurring: cls.isRecurring,
    });
    setShowEdit(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDefId) return;
    setSaving(true);

    const dayOfWeek = getDayOfWeekFromDate(form.date);

    try {
      const res = await fetch(`/api/admin/schedule/${editDefId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          instructor: form.instructor,
          dayOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          maxCapacity: Number(form.maxCapacity),
          location: form.location || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "עדכון השיעור נכשל");
        return;
      }

      toast.success("השיעור עודכן בהצלחה");
      setShowEdit(false);
      setEditDefId(null);
      fetchSchedule();
    } catch {
      toast.error("עדכון השיעור נכשל");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDef = async (classDefId: string) => {
    if (!confirm("להשבית את השיעור הזה? כל המופעים העתידיים יבוטלו.")) return;

    try {
      const res = await fetch(`/api/admin/schedule/${classDefId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("השיעור הושבת");
        fetchSchedule();
      }
    } catch {
      toast.error("השבתת השיעור נכשלה");
    }
  };

  const handleCancelInstance = async (instanceId: string) => {
    if (!confirm("לבטל מופע זה בלבד?")) return;

    try {
      const res = await fetch(`/api/admin/instances/${instanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCancelled: true }),
      });
      if (res.ok) {
        toast.success("המופע בוטל");
        fetchSchedule();
      }
    } catch {
      toast.error("ביטול המופע נכשל");
    }
  };

  const grouped = classes.reduce<Record<string, AdminClass[]>>((acc, cls) => {
    const day = format(new Date(cls.date), "yyyy-MM-dd");
    if (!acc[day]) acc[day] = [];
    acc[day].push(cls);
    return acc;
  }, {});

  const recurringLabel = form.date
    ? DAYS_HE[getDayOfWeekFromDate(form.date)] || ""
    : "";

  return (
    <div>
      {/* ── כותרת + ניווט ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-sage-700">
            {format(weekStart, "d בMMMM yyyy", { locale: he })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreate(true); }}
          className="rounded-2xl"
        >
          <Plus className="h-4 w-4 ml-2" />
          שיעור חדש
        </Button>
      </div>

      {/* ── רשימת שיעורים ── */}
      {loading ? (
        <PageLoader />
      ) : classes.length === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="py-16 text-center">
            <CalendarDays className="h-10 w-10 text-sage-200 mx-auto mb-4" />
            <p className="text-sage-500 text-lg font-medium">אין שיעורים בשבוע זה</p>
            <p className="text-sage-400 text-sm mt-1">לחצי על ״שיעור חדש״ כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dateStr, dayClasses]) => (
            <div key={dateStr}>
              <h3 className="text-sm font-bold text-sage-500 mb-3">
                {format(new Date(dateStr + "T00:00:00Z"), "EEEE, d בMMMM", { locale: he })}
              </h3>
              <div className="space-y-3">
                {dayClasses.map((cls) => (
                  <Card key={cls.id} className={`rounded-3xl ${cls.isCancelled ? "opacity-40" : ""}`}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <h4 className="font-bold text-sage-900">{cls.title}</h4>
                            <Badge className="rounded-full text-xs">
                              {cls.currentBookings}/{cls.maxCapacity}
                            </Badge>
                            {cls.isRecurring && (
                              <Badge variant="secondary" className="rounded-full text-xs gap-1">
                                <RotateCcw className="h-3 w-3" />
                                קבוע
                              </Badge>
                            )}
                            {cls.isCancelled && (
                              <Badge className="rounded-full text-xs bg-red-50 text-red-600 border border-red-200">
                                מבוטל
                              </Badge>
                            )}
                            {cls.waitlist.length > 0 && (
                              <Badge variant="secondary" className="rounded-full text-xs">
                                +{cls.waitlist.length} בהמתנה
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-sage-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {cls.startTime} – {cls.endTime}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {cls.instructor}
                            </span>
                            {cls.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {cls.location}
                              </span>
                            )}
                          </div>
                          {cls.bookings.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {cls.bookings.map((b) => (
                                <span key={b.user.id} className="inline-block rounded-full bg-sage-50 px-2 py-0.5 text-xs text-sage-600">
                                  {b.user.name || b.user.email}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {!cls.isCancelled && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => openEdit(cls)}
                              className="text-sage-400 hover:text-sage-700 hover:bg-sage-50 h-8 w-8"
                              title="עריכה"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => handleCancelInstance(cls.id)}
                              className="text-amber-400 hover:text-amber-600 hover:bg-amber-50 h-8 w-8"
                              title="ביטול מופע זה"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                            {cls.isRecurring && (
                              <Button
                                variant="ghost" size="icon"
                                onClick={() => handleDeleteDef(cls.classDefId)}
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8"
                                title="השבתת כל השיעורים"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════ דיאלוג יצירת שיעור ═══════════════════ */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>יצירת שיעור חדש</DialogTitle>
            <DialogDescription>
              בחרי תאריך, וסמני אם זה שיעור קבוע שבועי.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">שם שיעור</label>
              <Input
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="לדוגמה: ויניאסה בוקר"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">שם מורה</label>
              <Input
                value={form.instructor}
                onChange={(e) => updateField("instructor", e.target.value)}
                placeholder="שם המורה"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">תאריך</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => updateField("date", e.target.value)}
                required
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-sage-200 bg-sage-50/50 px-4 py-3">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) => updateField("isRecurring", e.target.checked)}
                className="h-5 w-5 rounded border-sage-300 text-sage-600 focus:ring-sage-500 accent-sage-600"
              />
              <div>
                <span className="text-sm font-medium text-sage-800">שיעור קבוע בכל שבוע</span>
                <p className="text-xs text-sage-500 mt-0.5">
                  {form.isRecurring
                    ? `ייווצרו 12 מופעים לכל יום ${recurringLabel}`
                    : "שיעור חד-פעמי בתאריך שנבחר"}
                </p>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">שעת התחלה</label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => updateField("startTime", e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">שעת סיום</label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => updateField("endTime", e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">כמות מקסימלית</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.maxCapacity}
                onChange={(e) => updateField("maxCapacity", parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">מיקום (אופציונלי)</label>
              <Input
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder="לדוגמה: סטודיו ראשי"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">תיאור (אופציונלי)</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="תיאור קצר של השיעור..."
                rows={2}
                className="flex w-full rounded-xl border border-sage-200 bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 resize-none"
              />
            </div>
            <Button type="submit" className="w-full rounded-2xl" disabled={creating}>
              {creating ? <Spinner className="h-4 w-4" /> : "יצירת שיעור"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════ דיאלוג עריכה ═══════════════════ */}
      <Dialog
        open={showEdit}
        onOpenChange={(open) => { setShowEdit(open); if (!open) setEditDefId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת שיעור</DialogTitle>
            <DialogDescription>
              השינויים יעודכנו בכל המופעים העתידיים.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">שם שיעור</label>
              <Input
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="לדוגמה: ויניאסה בוקר"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">שם מורה</label>
              <Input
                value={form.instructor}
                onChange={(e) => updateField("instructor", e.target.value)}
                placeholder="שם המורה"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">תאריך</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => updateField("date", e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">שעת התחלה</label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => updateField("startTime", e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">שעת סיום</label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => updateField("endTime", e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">כמות מקסימלית</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.maxCapacity}
                onChange={(e) => updateField("maxCapacity", parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">מיקום (אופציונלי)</label>
              <Input
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder="לדוגמה: סטודיו ראשי"
              />
            </div>
            <Button type="submit" className="w-full rounded-2xl" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "שמירת שינויים"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
