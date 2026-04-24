import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { BookingEngine } from "@/lib/booking-engine";

/**
 * POST /api/waitlist/leave
 *
 * Body: { classInstanceId: string }
 *
 * Voluntarily remove the current user from a waitlist. No credits
 * involved (joining the waitlist never costs anything). Idempotent
 * from the user's perspective — repeated calls after the first just
 * return 400 "not on waitlist".
 */
export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "יש להתחבר תחילה" }, { status: 401 });
    }

    let body: { classInstanceId?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const classInstanceId = body.classInstanceId;
    if (!classInstanceId || typeof classInstanceId !== "string") {
      return NextResponse.json(
        { error: "classInstanceId is required" },
        { status: 400 },
      );
    }

    await BookingEngine.leaveWaitlist(dbUser.id, classInstanceId);

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true, left: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "פעולה נכשלה";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
