"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { Users, CreditCard, Calendar, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface DashboardData {
  totalStudents: number;
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
