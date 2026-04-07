import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) {
      return NextResponse.json({ error: "יש להתחבר תחילה" }, { status: 401 });
    }

    const { workshopId } = await req.json();
    if (!workshopId) {
      return NextResponse.json({ error: "מזהה סדנה חסר" }, { status: 400 });
    }

    const workshop = await db.workshop.findUnique({ where: { id: workshopId } });
    if (!workshop || !workshop.isActive) {
      return NextResponse.json({ error: "הסדנה לא נמצאה" }, { status: 404 });
    }

    const existing = await db.workshopRegistration.findUnique({
      where: { userId_workshopId: { userId: dbUser.id, workshopId } },
    });

    if (existing && existing.paymentStatus !== "CANCELLED") {
      return NextResponse.json({ error: "כבר נרשמת לסדנה זו" }, { status: 400 });
    }

    if (workshop.maxCapacity) {
      const count = await db.workshopRegistration.count({
        where: { workshopId, paymentStatus: { not: "CANCELLED" } },
      });
      if (count >= workshop.maxCapacity) {
        return NextResponse.json({ error: "הסדנה מלאה" }, { status: 400 });
      }
    }

    const registration = await db.workshopRegistration.create({
      data: {
        userId: dbUser.id,
        workshopId,
        paymentStatus: "COMPLETED",
      },
    });

    revalidatePath("/workshops");

    return NextResponse.json({
      message: "ההרשמה לסדנה אושרה!",
      registrationId: registration.id,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "ההרשמה נכשלה" },
      { status: 400 }
    );
  }
}
