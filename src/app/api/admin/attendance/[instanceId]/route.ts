import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { BookingEngine } from "@/lib/booking-engine";
import { db } from "@/lib/db";

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

    const bookings = await db.booking.findMany({
      where: {
        classInstanceId: instanceId,
        status: "CONFIRMED",
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return NextResponse.json(bookings);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load attendance" },
      { status: 500 }
    );
  }
}

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

    const { bookingId, attended } = await req.json();
    const result = await BookingEngine.markAttendance(bookingId, attended, dbUser.id);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to mark attendance" },
      { status: 400 }
    );
  }
}
