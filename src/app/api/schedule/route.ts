import { NextResponse } from "next/server";
import { getWeeklySchedule } from "@/lib/schedule-service";
import { startOfWeek, addWeeks } from "date-fns";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const weekOffset = parseInt(searchParams.get("week") || "0");
    const weekStart = addWeeks(
      startOfWeek(new Date(), { weekStartsOn: 0 }),
      weekOffset
    );

    const schedule = await getWeeklySchedule(weekStart);
    return NextResponse.json(schedule);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load schedule" },
      { status: 500 }
    );
  }
}
