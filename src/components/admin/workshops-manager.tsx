"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { Plus, Pencil, Trash2, Upload, ImageIcon, Users, Mail, Phone, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface Attendee {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  phone: string | null;
  paymentStatus: "PENDING" | "COMPLETED" | "CANCELLED";
  registeredAt: string;
}

interface AttendeesPayload {
  workshop: { id: string; title: string; date: string };
  attendees: Attendee[];
  summary: { total: number; paid: number; pending: number; cancelled: number };
}

interface Workshop {
  id: string;
  title: string;
  description: string;
  date: string;
  price: number;
  imageUrl: string | null;
  maxCapacity: number | null;
  reminderEmailContent: string | null;
  reminderTimingHours: number | null;
  reminderSentAt: string | null;
  _count: { registrations: number };
}

export function WorkshopsManager() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // "upcoming" shows future workshops (default); "archive" shows past ones.
  // The API already returns ALL workshops sorted desc by date, so we just
  // partition client-side — no extra round-trip needed.
  const [view, setView] = useState<"upcoming" | "archive">("upcoming");
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [price, setPrice] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [maxCapacity, setMaxCapacity] = useState<number | "">("");
  // Per-workshop reminder configuration. Both fields are optional; if
  // `reminderTimingHours` is empty, the cron sends nothing for this
  // workshop. The body supports {{name}} {{title}} {{date}} {{time}}.
  const [reminderEmailContent, setReminderEmailContent] = useState("");
  const [reminderTimingHours, setReminderTimingHours] = useState<number | "">("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Attendees dialog state — opened when admin clicks the registration count
  const [attendeesWorkshopId, setAttendeesWorkshopId] = useState<string | null>(null);
  const [attendeesData, setAttendeesData] = useState<AttendeesPayload | null>(null);
  const [attendeesLoading, setAttendeesLoading] = useState(false);

  const openAttendees = useCallback(async (workshopId: string) => {
    setAttendeesWorkshopId(workshopId);
    setAttendeesData(null);
    setAttendeesLoading(true);
    try {
      const res = await fetch(`/api/admin/workshops/${workshopId}/attendees`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AttendeesPayload;
      setAttendeesData(data);
    } catch (err) {
      console.error("[workshops] attendees fetch failed:", err);
      toast.error("טעינת רשימת המשתתפות נכשלה");
    } finally {
      setAttendeesLoading(false);
    }
  }, []);

  const fetchWorkshops = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/workshops");
      const data = await res.json();
      setWorkshops(Array.isArray(data) ? data : []);
    } catch { toast.error("שגיאה בטעינת סדנאות"); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchWorkshops(); }, [fetchWorkshops]);

  const resetForm = () => {
    setEditId(null); setTitle(""); setDescription(""); setDate(""); setTime("10:00");
    setPrice(0); setImageUrl(""); setImagePreview(""); setMaxCapacity("");
    setReminderEmailContent(""); setReminderTimingHours("");
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (w: Workshop) => {
    setEditId(w.id);
    setTitle(w.title);
    setDescription(w.description);
    const d = new Date(w.date);
    setDate(format(d, "yyyy-MM-dd"));
    setTime(format(d, "HH:mm"));
    setPrice(w.price);
    setImageUrl(w.imageUrl || "");
    setImagePreview(w.imageUrl || "");
    setMaxCapacity(w.maxCapacity || "");
    setReminderEmailContent(w.reminderEmailContent || "");
    setReminderTimingHours(w.reminderTimingHours ?? "");
    setShowForm(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "העלאה נכשלה"); return; }
      setImageUrl(data.url);
      toast.success("התמונה הועלתה");
    } catch { toast.error("העלאה נכשלה"); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dateTime = new Date(`${date}T${time}:00`).toISOString();
      const url = editId ? `/api/admin/workshops/${editId}` : "/api/admin/workshops";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          date: dateTime,
          price,
          imageUrl: imageUrl || null,
          maxCapacity: maxCapacity || null,
          reminderEmailContent: reminderEmailContent.trim() || null,
          reminderTimingHours:
            reminderTimingHours === "" ? null : Number(reminderTimingHours),
        }),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || "שגיאה"); return; }
      toast.success(editId ? "הסדנה עודכנה" : "הסדנה נוצרה");
      setShowForm(false); resetForm(); fetchWorkshops();
    } catch { toast.error("שגיאה"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("להשבית סדנה זו?")) return;
    try {
      const res = await fetch(`/api/admin/workshops/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("הסדנה הושבתה"); fetchWorkshops(); }
    } catch { toast.error("מחיקה נכשלה"); }
  };

  if (loading) return <PageLoader />;

  // Partition by date — pre-computed so the render paths stay simple.
  const now = Date.now();
  const upcoming = workshops.filter((w) => new Date(w.date).getTime() >= now);
  const archive = workshops.filter((w) => new Date(w.date).getTime() < now);
  const visible = view === "archive" ? archive : upcoming;

  return (
    <div className="space-y-4">
      {/* ── Tab toggle — same visual language as the payments view ── */}
      <div
        role="tablist"
        aria-label="תצוגת סדנאות"
        className="flex items-center gap-1 rounded-3xl border border-sage-100 bg-white p-1"
      >
        <button
          role="tab"
          aria-selected={view === "upcoming"}
          onClick={() => setView("upcoming")}
          className={`flex-1 rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
            view === "upcoming"
              ? "bg-sage-600 text-white shadow-sm"
              : "bg-transparent text-sage-600 hover:bg-sage-50"
          }`}
        >
          קרובות ({upcoming.length})
        </button>
        <button
          role="tab"
          aria-selected={view === "archive"}
          onClick={() => setView("archive")}
          className={`flex-1 rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
            view === "archive"
              ? "bg-sage-600 text-white shadow-sm"
              : "bg-transparent text-sage-600 hover:bg-sage-50"
          }`}
        >
          ארכיון ({archive.length})
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-sage-500">
          {view === "archive"
            ? `${archive.length} סדנאות שהתקיימו`
            : `${upcoming.length} סדנאות קרובות`}
        </p>
        {view === "upcoming" && (
          <Button onClick={openCreate} className="rounded-2xl gap-2">
            <Plus className="h-4 w-4" />
            סדנה חדשה
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="py-12 text-center text-sage-400">
            {view === "archive"
              ? "עוד לא התקיימו סדנאות."
              : "אין סדנאות קרובות."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((w) => (
            <Card key={w.id} className="rounded-3xl">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {w.imageUrl && <img src={w.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded-xl object-cover" />}
                    <div className="min-w-0">
                      <p className="font-bold text-sage-900 text-sm truncate">{w.title}</p>
                      <p className="text-xs text-sage-400">
                        {format(new Date(w.date), "d בMMMM yyyy · HH:mm", { locale: he })} · ₪{w.price}
                      </p>
                      {/* Clickable attendee count → opens the attendees dialog.
                          Only enabled when there are actually registrations,
                          to avoid a useless "0 nothing to show" dialog. */}
                      {w._count.registrations > 0 ? (
                        <button
                          type="button"
                          onClick={() => openAttendees(w.id)}
                          className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-sage-50 px-2 py-0.5 text-xs font-medium text-sage-700 hover:bg-sage-100 transition-colors"
                          aria-label="צפייה ברשימת המשתתפות"
                        >
                          <Users className="h-3 w-3" />
                          {w._count.registrations} נרשמו · צפייה
                        </button>
                      ) : (
                        <p className="text-xs text-sage-400 flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" /> 0 נרשמו
                        </p>
                      )}
                    </div>
                  </div>
                  {/*
                   * Only show edit/delete on upcoming workshops.
                   * Archive view is read-only — triggering DELETE on a
                   * past workshop would fire the "refund is coming"
                   * cancellation emails to people who already attended.
                   */}
                  {view === "upcoming" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}>
                        <Pencil className="h-3.5 w-3.5 text-sage-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(w.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "עריכת סדנה" : "סדנה חדשה"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">שם הסדנה</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: סדנת נשימה מודעת" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">תאריך</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">שעה</label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">מחיר (₪)</label>
                <Input type="number" min={0} value={price} onChange={(e) => setPrice(parseInt(e.target.value) || 0)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">מקומות (אופציונלי)</label>
                <Input type="number" min={1} value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value ? parseInt(e.target.value) : "")} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-sage-700 mb-2 block">תמונה</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              {imagePreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-sage-200">
                  <img src={imagePreview} alt="" className="w-full aspect-video object-cover" />
                  <button type="button" onClick={() => fileRef.current?.click()} className="absolute inset-0 flex items-center justify-center bg-sage-950/30 text-white opacity-0 hover:opacity-100 transition-opacity">
                    <Upload className="h-6 w-6" />
                  </button>
                  {uploading && <div className="absolute inset-0 flex items-center justify-center bg-white/80"><Spinner className="h-6 w-6" /></div>}
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sage-200 bg-sage-50/50 py-8 text-sm text-sage-500 transition-colors hover:border-sage-300">
                  {uploading ? <Spinner className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                  {uploading ? "מעלה..." : "העלאת תמונה"}
                </button>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">תיאור</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור הסדנה..." rows={4} required className="flex w-full rounded-xl border border-sage-200 bg-white px-4 py-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 resize-y" />
            </div>

            {/* ════ תזכורת אוטומטית ════
                Optional. If `reminderTimingHours` is empty, no reminder is
                sent. The cron at /api/cron/reminders queries this once a day
                and dispatches the message to all paid registrants. */}
            <div className="rounded-2xl border border-sage-100 bg-sage-50/30 p-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-sage-700 mb-1 block">תזכורת אוטומטית למשתתפות (אופציונלי)</label>
                <p className="text-xs text-sage-500">המייל יישלח לפני הסדנה לכל מי ששילמה. השאירי ריק כדי לא לשלוח תזכורת.</p>
              </div>

              <div>
                <label className="text-xs font-medium text-sage-600 mb-1 block">מתי לשלוח (שעות לפני הסדנה)</label>
                <select
                  value={reminderTimingHours}
                  onChange={(e) => setReminderTimingHours(e.target.value === "" ? "" : Number(e.target.value))}
                  className="flex h-10 w-full rounded-xl border border-sage-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
                >
                  <option value="">ללא תזכורת</option>
                  <option value={24}>24 שעות לפני (יום לפני)</option>
                  <option value={48}>48 שעות לפני (יומיים לפני)</option>
                  <option value={72}>72 שעות לפני (שלושה ימים לפני)</option>
                  <option value={168}>שבוע לפני</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-sage-600 mb-1 block">תוכן התזכורת</label>
                <textarea
                  value={reminderEmailContent}
                  onChange={(e) => setReminderEmailContent(e.target.value)}
                  placeholder="היי {{name}}, רק מזכירים שיש לנו סדנה {{title}} ב-{{date}} בשעה {{time}}. מומלץ להגיע 10 דק׳ לפני..."
                  rows={5}
                  disabled={reminderTimingHours === ""}
                  className="flex w-full rounded-xl border border-sage-200 bg-white px-4 py-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 resize-y disabled:bg-sage-50 disabled:text-sage-400"
                />
                <p className="mt-1 text-[11px] text-sage-400">
                  משתנים נתמכים: <code className="bg-sage-100 px-1 rounded">{`{{name}}`}</code> · <code className="bg-sage-100 px-1 rounded">{`{{title}}`}</code> · <code className="bg-sage-100 px-1 rounded">{`{{date}}`}</code> · <code className="bg-sage-100 px-1 rounded">{`{{time}}`}</code>
                </p>
              </div>

              {editId && (
                <p className="text-[11px] text-sage-400 italic">
                  שינוי שעת התזכורת או תאריך הסדנה יאפס את סימון השליחה — תזכורת חדשה תישלח שוב על-פי לוח הזמנים החדש.
                </p>
              )}
            </div>

            <Button type="submit" className="w-full rounded-2xl" disabled={saving || uploading}>
              {saving ? <Spinner className="h-4 w-4" /> : editId ? "שמירת שינויים" : "יצירת סדנה"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════ Attendees dialog — read-only list of registered users ════ */}
      <Dialog
        open={attendeesWorkshopId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAttendeesWorkshopId(null);
            setAttendeesData(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>משתתפות בסדנה</DialogTitle>
            <DialogDescription>
              {attendeesData
                ? `${attendeesData.workshop.title} · ${format(new Date(attendeesData.workshop.date), "d בMMMM yyyy · HH:mm", { locale: he })}`
                : "טוען רשימה…"}
            </DialogDescription>
          </DialogHeader>

          {attendeesLoading || !attendeesData ? (
            <div className="py-12 text-center">
              <Spinner className="mx-auto h-6 w-6" />
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              {/* Summary bar */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-2xl bg-sage-50/50 px-2 py-3">
                  <p className="text-lg font-bold text-sage-900">{attendeesData.summary.total}</p>
                  <p className="text-[10px] text-sage-500">סה״כ</p>
                </div>
                <div className="rounded-2xl bg-emerald-50/40 px-2 py-3">
                  <p className="text-lg font-bold text-emerald-700">{attendeesData.summary.paid}</p>
                  <p className="text-[10px] text-sage-500">שילמו</p>
                </div>
                <div className="rounded-2xl bg-amber-50/40 px-2 py-3">
                  <p className="text-lg font-bold text-amber-700">{attendeesData.summary.pending}</p>
                  <p className="text-[10px] text-sage-500">בהמתנה</p>
                </div>
                <div className="rounded-2xl bg-red-50/40 px-2 py-3">
                  <p className="text-lg font-bold text-red-600">{attendeesData.summary.cancelled}</p>
                  <p className="text-[10px] text-sage-500">בוטלו</p>
                </div>
              </div>

              {attendeesData.attendees.length === 0 ? (
                <p className="text-sm text-sage-400 text-center py-6">
                  אין משתתפות עדיין.
                </p>
              ) : (
                <div className="space-y-2">
                  {attendeesData.attendees.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-sage-100 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sage-900 text-sm truncate">
                          {a.name || "ללא שם"}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-sage-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span dir="ltr">{a.email}</span>
                          </span>
                          {a.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              <span dir="ltr">{a.phone}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-sage-400 mt-0.5">
                          נרשמה {format(new Date(a.registeredAt), "d בMMMM yyyy · HH:mm", { locale: he })}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {a.paymentStatus === "COMPLETED" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> שולם
                          </span>
                        ) : a.paymentStatus === "PENDING" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            <Clock3 className="h-3 w-3" /> בהמתנה
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                            <XCircle className="h-3 w-3" /> בוטל
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
