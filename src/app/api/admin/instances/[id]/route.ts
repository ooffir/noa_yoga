import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { BookingEngine } from "@/lib/booking-engine";

/**
 * Admin endpoint for editing a single ClassInstance.
 *
 * Three distinct behaviors depending on what the admin sent:
 *   1. { isCancelled: true } → full cancellation cascade via BookingEngine
 *      (refund every booked student, drop waitlist, email everyone).
 *   2. { maxCapacity: N } with N higher than current → auto-promote from
 *      the waitlist to fill the new seats.
 *   3. Other fields (startTime/endTime) → straight update.
 *
 * All three paths revalidate `/schedule` so the student view reflects
 * the change immediately.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    // ── Path 1: cancellation (with refund cascade) ──
    if (body.isCancelled === true) {
      const result = await BookingEngine.adminCancelClassInstance(
        id,
        typeof body.reason === "string" ? body.reason : undefined,
      );
      revalidateTag("schedule", "max");
      revalidatePath("/schedule");
      return NextResponse.json({
        ok: true,
        cancelled: true,
        affectedCount: result.affectedCount,
      });
    }

    // ── Path 2: capacity change — promote from waitlist if increased ──
    if (
      typeof body.maxCapacity === "number" &&
      body.maxCapacity > 0 &&
      // Don't promote when this PATCH is also touching other fields that
      // could have caused the increase for a different reason. Keep the
      // capacity-only path focused.
      Object.keys(body).every((k) =>
        ["maxCapacity", "startTime", "endTime"].includes(k),
      )
    ) {
      const { promotedInfos } = await BookingEngine.adminSetCapacity(
        id,
        Number(body.maxCapacity),
      );

      // If other fields accompanied the capacity change, apply them too.
      if (body.startTime || body.endTime) {
        await db.classInstance.update({
          where: { id },
          data: {
            startTime: body.startTime ?? undefined,
            endTime: body.endTime ?? undefined,
          },
        });
      }

      revalidateTag("schedule", "max");
      revalidatePath("/schedule");
      return NextResponse.json({
        ok: true,
        promoted: promotedInfos.length,
      });
    }

    // ── Path 3: plain update (time fields only) ──
    const updated = await db.classInstance.update({
      where: { id },
      data: {
        startTime: body.startTime ?? undefined,
        endTime: body.endTime ?? undefined,
      },
    });

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[admin/instances PATCH] failed:", err);
    return NextResponse.json({ error: "עדכון נכשל" }, { status: 500 });
  }
}
