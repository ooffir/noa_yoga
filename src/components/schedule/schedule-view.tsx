"use client";

import { useState, useEffect } from "react";
import { format, addWeeks, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassCard } from "./class-card";
import { PageLoader } from "@/components/ui/loading";

interface ScheduleClass {
  id: string;
  title: string;
  description: string | null;
  instructor: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
  isAvailable: boolean;
}

export function ScheduleView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [classes, setClasses] = useState<ScheduleClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSchedule() {
      setLoading(true);
      try {
        const res = await fetch(`/api/schedule?week=${weekOffset}`);
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch {
        setClasses([]);
      }
      setLoading(false);
    }
    fetchSchedule();
  }, [weekOffset]);

  const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset);

  // Group by day
  const grouped = classes.reduce<Record<string, ScheduleClass[]>>((acc, cls) => {
    const day = format(new Date(cls.date), "yyyy-MM-dd");
    if (!acc[day]) acc[day] = [];
    acc[day].push(cls);
    return acc;
  }, {});

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekOffset((w) => w - 1)}
          disabled={weekOffset <= 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-sm font-medium text-sage-700">
          Week of {format(weekStart, "MMM d, yyyy")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekOffset((w) => w + 1)}
          disabled={weekOffset >= 3}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {loading ? (
        <PageLoader />
      ) : classes.length === 0 ? (
        <div className="text-center py-16 text-sage-400">
          No classes scheduled for this week.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([dateStr, dayClasses]) => (
            <div key={dateStr}>
              <h3 className="text-sm font-semibold text-sage-500 uppercase tracking-wider mb-3">
                {format(new Date(dateStr), "EEEE, MMM d")}
              </h3>
              <div className="space-y-3">
                {dayClasses.map((cls) => (
                  <ClassCard key={cls.id} classData={cls} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
