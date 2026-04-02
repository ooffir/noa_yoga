import { NextResponse } from "next/server";
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
    if (dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { action, classInstanceId } = await req.json();

    if (action === "add") {
      const booking = await BookingEngine.adminAddStudent(classInstanceId, id);
      return NextResponse.json(booking, { status: 201 });
    }

    if (action === "remove") {
      const result = await BookingEngine.adminRemoveStudent(classInstanceId, id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Action failed" },
      { status: 400 }
    );
  }
}
