"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { Users, CreditCard, Calendar, TrendingUp, UserCheck, UserX } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface DashboardData {
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  activePunchCards: number;
  monthlyRevenue: number;
  weeklyBookings: number;
  popularClasses: {
    id: string;
    title: string;
    instructor: string;
    totalBookings: number;
  }[];
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

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
                <div>
                  <p className="text-sm text-sage-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-sage-900">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
