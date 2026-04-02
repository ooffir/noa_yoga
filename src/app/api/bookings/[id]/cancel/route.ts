import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { BookingEngine } from "@/lib/booking-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await BookingEngine.cancelBooking(dbUser.id, id);

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");

    return NextResponse.json({
      message: result.refunded
        ? "Booking cancelled. Credit has been refunded."
        : "Booking cancelled. Late cancellation — no credit refund.",
      refunded: result.refunded,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Cancellation failed" },
      { status: 400 }
    );
  }
}
