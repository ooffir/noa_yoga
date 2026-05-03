"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import {
  Users,
  CreditCard,
  Calendar,
  TrendingUp,
  UserCheck,
  UserX,
  Ticket,
  Package,
  Sparkles,
  Flame,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ProductStats {
  revenueAgurot: number;
  salesCount: number;
}

interface DashboardData {
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  activePunchCards: number;
  /** Total monthly revenue in agurot (credits + workshops). */
  monthlyRevenue: number;
  /** Optional split of monthlyRevenue. May be absent on legacy backends. */
  revenueBreakdown?: { credits: number; workshops: number };
  /** Per-product detail. Optional so older backends can still render. */
  productRevenue?: {
    SINGLE_CLASS: ProductStats;
    PUNCH_CARD_5: ProductStats;
    PUNCH_CARD: ProductStats;
    WORKSHOP: ProductStats;
  };
  weeklyBookings: number;
  popularClasses: {
    id: string;
    title: string;
    instructor: string;
    totalBookings: number;
  }[];
}

type ProductFilterKey =
  | "ALL"
  | "SINGLE_CLASS"
  | "PUNCH_CARD_5"
  | "PUNCH_CARD"
  | "WORKSHOP";

interface ProductFilterDef {
  key: ProductFilterKey;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes for the icon background + text. */
  color: string;
}

const PRODUCT_FILTERS: ProductFilterDef[] = [
  { key: "ALL", label: "סה״כ הכל", shortLabel: "הכל", icon: Flame, color: "text-amber-600 bg-amber-50" },
  { key: "SINGLE_CLASS", label: "שיעור בודד", shortLabel: "בודד", icon: Ticket, color: "text-sage-600 bg-sage-50" },
  { key: "PUNCH_CARD_5", label: "כרטיסיית 5", shortLabel: "5 שיעורים", icon: Package, color: "text-blue-600 bg-blue-50" },
  { key: "PUNCH_CARD", label: "כרטיסיית 10", shortLabel: "10 שיעורים", icon: Sparkles, color: "text-emerald-600 bg-emerald-50" },
  { key: "WORKSHOP", label: "סדנאות", shortLabel: "סדנאות", icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
];

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  // Selected filter pill in the product-revenue breakdown card.
  const [productFilter, setProductFilter] = useState<ProductFilterKey>("ALL");

  useEffect(() => {
    fetch("/api/admin/dashboard", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(setData)
      .catch((err) => {
        console.error("[dashboard-view] fetch failed:", err);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Product breakdown derivation ──
  // The breakdown card shows ALL products as small tiles regardless
  // of the active filter. Filtering only changes the headline (revenue
  // + sales count) at the top of the card, so the admin can switch
  // focus without losing sight of the rest.
  //
  // Derived BEFORE any conditional return so the hook order is stable
  // across renders (Rules of Hooks).
  const breakdown = useMemo(() => {
    if (!data || !data.productRevenue) {
      return null;
    }
    const products = [
      { ...PRODUCT_FILTERS[1], stats: data.productRevenue.SINGLE_CLASS },
      { ...PRODUCT_FILTERS[2], stats: data.productRevenue.PUNCH_CARD_5 },
      { ...PRODUCT_FILTERS[3], stats: data.productRevenue.PUNCH_CARD },
      { ...PRODUCT_FILTERS[4], stats: data.productRevenue.WORKSHOP },
    ];

    let headline: ProductStats;
    let headlineDef: ProductFilterDef;
    if (productFilter === "ALL") {
      headlineDef = PRODUCT_FILTERS[0];
      headline = {
        revenueAgurot: products.reduce((s, p) => s + p.stats.revenueAgurot, 0),
        salesCount: products.reduce((s, p) => s + p.stats.salesCount, 0),
      };
    } else {
      const found = products.find((p) => p.key === productFilter)!;
      headlineDef = found;
      headline = found.stats;
    }

    return { products, headline, headlineDef };
  }, [data, productFilter]);

  if (loading) return <PageLoader />;
  if (!data) return <p className="text-sage-500">שגיאה בטעינת לוח הבקרה.</p>;

  const activePct =
    data.totalStudents > 0
      ? Math.round((data.activeStudents / data.totalStudents) * 100)
      : 0;

  const stats = [
    {
      label: "סה״כ תלמידות",
      value: data.totalStudents,
      icon: Users,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "כרטיסיות פעילות",
      value: data.activePunchCards,
      icon: CreditCard,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "הכנסות החודש",
      value: formatCurrency(data.monthlyRevenue),
      icon: TrendingUp,
      color: "text-amber-600 bg-amber-50",
      // Optional secondary line — only shown if the API returned a
      // breakdown. Helps Noa see at a glance how much came from
      // workshops vs. punch cards / single classes.
      sublabel: data.revenueBreakdown
        ? `כרטיסיות ${formatCurrency(data.revenueBreakdown.credits)} · סדנאות ${formatCurrency(data.revenueBreakdown.workshops)}`
        : undefined,
    },
    {
      label: "הזמנות השבוע",
      value: data.weeklyBookings,
      icon: Calendar,
      color: "text-purple-600 bg-purple-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="rounded-3xl">
            <CardContent className="pt-5">
              <div className="flex items-center gap-4">
                <div className={`rounded-2xl p-3 ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-sage-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-sage-900">{stat.value}</p>
                  {"sublabel" in stat && stat.sublabel && (
                    <p className="text-[11px] text-sage-400 mt-0.5 truncate" dir="rtl">
                      {stat.sublabel}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Revenue breakdown by product type ──
          Shows the full picture in 4 tiles + a filter pill row that
          lets Noa drill down to a single product type. Only renders
          when the API surfaces the new productRevenue field. */}
      {breakdown && (
        <Card className="rounded-3xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              פירוט הכנסות לפי מוצר (החודש)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter pill row */}
            <div
              role="tablist"
              aria-label="פילטר מוצר"
              className="flex flex-wrap items-center gap-1.5"
            >
              {PRODUCT_FILTERS.map((f) => {
                const selected = productFilter === f.key;
                return (
                  <button
                    key={f.key}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setProductFilter(f.key)}
                    className={`flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? "bg-sage-600 text-white shadow-sm"
                        : "bg-sage-50 text-sage-600 hover:bg-sage-100"
                    }`}
                  >
                    <f.icon className="h-3.5 w-3.5" />
                    {f.shortLabel}
                  </button>
                );
              })}
            </div>

            {/* Headline — drives off the filter selection */}
            <div className="flex items-center gap-4 rounded-3xl border border-sage-100 bg-sage-50/40 p-4">
              <div
                className={`rounded-2xl p-3 ${breakdown.headlineDef.color}`}
              >
                <breakdown.headlineDef.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-sage-500 truncate">
                  {breakdown.headlineDef.label}
                </p>
                <p className="text-3xl font-bold text-sage-900">
                  {formatCurrency(breakdown.headline.revenueAgurot)}
                </p>
                <p className="text-[11px] text-sage-400 mt-0.5">
                  {breakdown.headline.salesCount} מכירות החודש
                </p>
              </div>
            </div>

            {/* Per-product tiles — always visible regardless of filter */}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {breakdown.products.map((p) => {
                const selected = productFilter === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setProductFilter(p.key)}
                    className={`text-right rounded-2xl border px-3 py-3 transition-all ${
                      selected
                        ? "border-sage-300 bg-white shadow-sm"
                        : "border-sage-100 bg-white hover:border-sage-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`rounded-xl p-1.5 ${p.color}`}>
                        <p.icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[11px] font-medium text-sage-600 truncate">
                        {p.label}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-sage-900">
                      {formatCurrency(p.stats.revenueAgurot)}
                    </p>
                    <p className="text-[10px] text-sage-400">
                      {p.stats.salesCount} מכירות
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Active vs Inactive split ──
          Active    = credits > 0 OR ≥1 active punch card (can book now)
          Inactive  = registered but out of credit (re-engagement target)
          Shown as a single card with a mini bar + two inline counts so
          the ratio is readable at a glance. */}
      <Card className="rounded-3xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            פעילות תלמידות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div className="rounded-2xl bg-emerald-100 p-2.5 text-emerald-700">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-sage-500">פעילות (יש קרדיט)</p>
                <p className="text-2xl font-bold text-sage-900">
                  {data.activeStudents}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-sage-100 bg-sage-50/40 p-4">
              <div className="rounded-2xl bg-sage-100 p-2.5 text-sage-600">
                <UserX className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-sage-500">לא פעילות</p>
                <p className="text-2xl font-bold text-sage-900">
                  {data.inactiveStudents}
                </p>
              </div>
            </div>
          </div>

          {data.totalStudents > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-sage-500 mb-1">
                <span>{activePct}% פעילות מכלל התלמידות</span>
                <span>
                  {data.activeStudents}/{data.totalStudents}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-sage-100">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${activePct}%` }}
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-sage-500 leading-relaxed">
            &quot;פעילות&quot; = תלמידות עם יתרת קרדיטים ישירה או כרטיסייה
            פעילה. &quot;לא פעילות&quot; = נרשמו אך ללא יתרה — אלו המתאימות
            לקמפיין חידוש/הטבה.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>שיעורים פופולריים (החודש)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.popularClasses.length === 0 ? (
            <p className="text-sage-400 text-sm">אין נתונים עדיין.</p>
          ) : (
            <div className="space-y-3">
              {data.popularClasses.map((cls, idx) => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between rounded-2xl bg-sage-50/50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-sage-400 w-6">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-medium text-sage-900 text-sm">{cls.title}</p>
                      <p className="text-xs text-sage-500">{cls.instructor}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-sage-700">
                    {cls.totalBookings} הזמנות
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
