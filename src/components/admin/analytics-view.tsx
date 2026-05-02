"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { format, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Users,
  Activity,
  CalendarClock,
  Search,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

// ─────────────────────────────────────────────────────────────────────────────
//  Types — mirror src/lib/analytics.ts AnalyticsPayload
// ─────────────────────────────────────────────────────────────────────────────
interface DemandRow {
  dow: number;
  startTime: string;
  title: string;
  bookings: number;
  totalCapacity: number;
  instances: number;
  fillRate: number;
}
interface RevenueRow {
  weekStart: string;
  paymentsAgurot: number;
  workshopsAgurot: number;
  totalIls: number;
}
interface StudentRow {
  userId: string;
  name: string | null;
  email: string;
  totalBookings: number;
  mostActiveTime: string | null;
}
interface Utilization {
  totalBookings: number;
  totalCapacity: number;
  rate: number;
}
interface AnalyticsPayload {
  filters: { startDate: string; endDate: string; classTitle: string | null };
  demand: DemandRow[];
  revenue: RevenueRow[];
  students: StudentRow[];
  utilization: Utilization;
  classTitles: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Date range presets
// ─────────────────────────────────────────────────────────────────────────────
type Preset = "7d" | "30d" | "90d" | "custom";
const DAY_MS = 24 * 60 * 60 * 1000;

function presetToDates(preset: Preset): { start: string; end: string } {
  const end = new Date();
  const endStr = end.toISOString().slice(0, 10);
  if (preset === "7d") return { start: iso(end, -7), end: endStr };
  if (preset === "30d") return { start: iso(end, -30), end: endStr };
  if (preset === "90d") return { start: iso(end, -90), end: endStr };
  return { start: iso(end, -30), end: endStr };
}
function iso(end: Date, deltaDays: number) {
  return new Date(end.getTime() + deltaDays * DAY_MS).toISOString().slice(0, 10);
}

const DOW_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// ─────────────────────────────────────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────────────────────────────────────
export function AnalyticsView() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [startDate, setStartDate] = useState<string>(() => presetToDates("30d").start);
  const [endDate, setEndDate] = useState<string>(() => presetToDates("30d").end);
  const [classTitle, setClassTitle] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState("");
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
      });
      if (classTitle) params.set("classTitle", classTitle);
      const res = await fetch(`/api/admin/analytics?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const payload = (await res.json()) as AnalyticsPayload;
      setData(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error("טעינת ניתוח נתונים נכשלה");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, classTitle]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const { start, end } = presetToDates(p);
      setStartDate(start);
      setEndDate(end);
    }
  };

  // ──────────── Chart data shaping ────────────
  const demandChartData = useMemo(() => {
    if (!data) return [];
    // Group demand rows into "DoW + startTime" buckets
    const byKey = new Map<
      string,
      { label: string; bookings: number; capacity: number; fillRate: number }
    >();
    for (const row of data.demand) {
      const key = `${row.dow}-${row.startTime}`;
      const label = `${DOW_LABELS[row.dow]} ${row.startTime}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.bookings += row.bookings;
        existing.capacity += row.totalCapacity;
        existing.fillRate =
          existing.capacity > 0 ? existing.bookings / existing.capacity : 0;
      } else {
        byKey.set(key, {
          label,
          bookings: row.bookings,
          capacity: row.totalCapacity,
          fillRate: row.fillRate,
        });
      }
    }
    return [...byKey.values()]
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 12); // top 12 slots
  }, [data]);

  const revenueChartData = useMemo(() => {
    if (!data) return [];
    return data.revenue.map((r) => ({
      label: format(parseISO(r.weekStart), "d בMMM", { locale: he }),
      weekStart: r.weekStart,
      שיעורים: r.paymentsAgurot / 100,
      סדנאות: r.workshopsAgurot / 100,
      "סה״כ": r.totalIls,
    }));
  }, [data]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const s = studentSearch.trim().toLowerCase();
    if (!s) return data.students;
    return data.students.filter(
      (row) =>
        row.name?.toLowerCase().includes(s) ||
        row.email.toLowerCase().includes(s),
    );
  }, [data, studentSearch]);

  // ──────────── Render ────────────
  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="rounded-3xl">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={preset === p ? "default" : "outline"}
                  onClick={() => handlePreset(p)}
                  className="rounded-2xl"
                >
                  {p === "7d" ? "7 ימים" : p === "30d" ? "30 יום" : "90 יום"}
                </Button>
              ))}
            </div>

            <span className="text-xs text-sage-400">או:</span>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset("custom");
                }}
                className="w-[160px]"
              />
              <span className="text-sage-400">—</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset("custom");
                }}
                className="w-[160px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-sage-600">סוג שיעור:</label>
              <select
                value={classTitle}
                onChange={(e) => setClassTitle(e.target.value)}
                className="rounded-2xl border border-sage-200 bg-white px-3 py-2 text-sm text-sage-700 focus:outline-none focus:ring-2 focus:ring-sage-400"
              >
                <option value="">כל סוגי השיעורים</option>
                {data?.classTitles.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="ml-auto rounded-2xl gap-2"
            >
              {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              רענן
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="rounded-3xl border-red-200">
          <CardContent className="py-4 text-sm text-red-600">
            שגיאה: {error}
          </CardContent>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiTile
          icon={<Activity className="h-5 w-5" />}
          label="תפוסה כוללת"
          value={
            data
              ? `${Math.round(data.utilization.rate * 100)}%`
              : loading
                ? "…"
                : "—"
          }
          sub={
            data
              ? `${data.utilization.totalBookings.toLocaleString()} / ${data.utilization.totalCapacity.toLocaleString()} מקומות`
              : undefined
          }
          loading={loading}
        />
        <KpiTile
          icon={<TrendingUp className="h-5 w-5" />}
          label="הכנסות בתקופה"
          value={
            data
              ? `₪${data.revenue
                  .reduce((s, r) => s + r.totalIls, 0)
                  .toLocaleString("he-IL", { maximumFractionDigits: 0 })}`
              : loading
                ? "…"
                : "—"
          }
          sub={data ? `${data.revenue.length} שבועות` : undefined}
          loading={loading}
        />
        <KpiTile
          icon={<Users className="h-5 w-5" />}
          label="תלמידות פעילות"
          value={data ? `${data.students.length}` : loading ? "…" : "—"}
          sub="לפי מספר הזמנות בתקופה"
          loading={loading}
        />
      </div>

      {/* Demand bar chart */}
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-sage-600" />
            ביקוש לפי יום ושעה (Top 12)
          </CardTitle>
          <p className="mt-1 text-xs text-sage-500">
            ככל שהעמודה גבוהה וצבעה ירוק כהה — השיעור ״חם״ יותר ונוטה להתמלא.
          </p>
        </CardHeader>
        <CardContent>
          {loading || !data ? (
            <ChartSkeleton />
          ) : demandChartData.length === 0 ? (
            <EmptyState label="אין מספיק נתוני ביקוש לתקופה" />
          ) : (
            <div className="h-[320px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={demandChartData} margin={{ left: 8, right: 8, top: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eae4" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#587b5b" }} interval={0} angle={-30} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 11, fill: "#587b5b" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e8eae4" }}
                  />
                  <Legend />
                  <Bar dataKey="bookings" fill="#587b5b" name="הזמנות" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="capacity" fill="#cbd9c5" name="יכולת" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue line chart */}
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-sage-600" />
            הכנסות שבועיות (₪)
          </CardTitle>
          <p className="mt-1 text-xs text-sage-500">
            תשלומים מאושרים בלבד — כולל שיעורים, כרטיסיות וסדנאות.
          </p>
        </CardHeader>
        <CardContent>
          {loading || !data ? (
            <ChartSkeleton />
          ) : revenueChartData.length === 0 ? (
            <EmptyState label="אין הכנסות רשומות בתקופה" />
          ) : (
            <div className="h-[300px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData} margin={{ left: 8, right: 8, top: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eae4" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#587b5b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#587b5b" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e8eae4" }} />
                  <Legend />
                  <Line type="monotone" dataKey="שיעורים" stroke="#cbd9c5" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="סדנאות" stroke="#d4a574" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="סה״כ" stroke="#587b5b" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student engagement table */}
      <Card className="rounded-3xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-sage-600" />
            מעורבות תלמידות (Top 50)
          </CardTitle>
          <div className="relative w-[240px] max-w-full">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
            <Input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="חיפוש…"
              className="pr-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading || !data ? (
            <TableSkeleton />
          ) : filteredStudents.length === 0 ? (
            <EmptyState label="לא נמצאו תלמידות עם הזמנות בתקופה" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sage-100 text-right text-xs font-medium text-sage-500">
                    <th className="py-2 pr-2">שם</th>
                    <th className="py-2">אימייל</th>
                    <th className="py-2 text-center">הזמנות</th>
                    <th className="py-2 text-center">שעה פעילה ביותר</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => (
                    <tr
                      key={s.userId}
                      className="border-b border-sage-50 last:border-b-0 hover:bg-sage-50/50"
                    >
                      <td className="py-2 pr-2 font-medium text-sage-900">
                        {s.name || "—"}
                      </td>
                      <td className="py-2 text-sage-500 truncate max-w-[220px]">
                        {s.email}
                      </td>
                      <td className="py-2 text-center font-semibold text-sage-800">
                        {s.totalBookings}
                      </td>
                      <td className="py-2 text-center text-sage-600">
                        {s.mostActiveTime || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────────
function KpiTile({
  icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-sage-500">{label}</p>
            {loading ? (
              <div className="mt-1 h-7 w-20 animate-pulse rounded bg-sage-100" />
            ) : (
              <p className="text-2xl font-bold text-sage-900">{value}</p>
            )}
            {sub && <p className="mt-0.5 text-[11px] text-sage-400">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return <div className="h-[280px] animate-pulse rounded-2xl bg-sage-50" />;
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded-xl bg-sage-50" />
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-sage-200 py-10 text-center text-sm text-sage-400">
      {label}
    </div>
  );
}
