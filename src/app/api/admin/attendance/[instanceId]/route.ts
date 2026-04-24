import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { BookingEngine } from "@/lib/booking-engine";
import { db } from "@/lib/db";

/**
 * GET /api/admin/attendance/[instanceId]
 *
 * Returns both CONFIRMED bookings and the active waitlist for one
 * class instance — so the admin attendance view can render "ממתינות"
 * beneath "רשומות" and surface the manual "Promote now" button.
 *
 * Previous revision returned only bookings; this expansion is the
 * backing for scenario 55 (Admin sees the waitlist).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { instanceId } = await params;

    const [bookings, waitlist] = await Promise.all([
      db.booking.findMany({
        where: { classInstanceId: instanceId, status: "CONFIRMED" },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      }),
      db.waitlistEntry.findMany({
        where: { classInstanceId: instanceId, status: "WAITING" },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({ bookings, waitlist });
  } catch (error) {
    console.error("[admin/attendance GET] failed:", error);
    return NextResponse.json(
      { error: "Failed to load attendance" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/attendance/[instanceId]
 *
 * Two actions, dispatched by `action` field in the body:
 *   1. action omitted + { bookingId, attended } → toggle attendance mark.
 *   2. action="promote" + { userId } → pull a specific student off the
 *      waitlist into the class with credit deduction (bypasses capacity).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { instanceId } = await params;
    const body = await req.json();

    if (body.action === "promote") {
      if (!body.userId || typeof body.userId !== "string") {
        return NextResponse.json(
          { error: "userId is required" },
          { status: 400 },
        );
      }
      const result = await BookingEngine.adminPromoteWaitlistStudent(
        instanceId,
        body.userId,
      );
      revalidateTag("schedule", "max");
      revalidatePath("/schedule");
      return NextResponse.json({
        ok: true,
        promoted: result.promoted,
        overrode: result.overrode,
      });
    }

    // Default path — toggle attendance
    const { bookingId, attended } = body;
    const result = await BookingEngine.markAttendance(
      bookingId,
      attended,
      dbUser.id,
    );
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed" },
      { status: 400 }
    );
  }
}
