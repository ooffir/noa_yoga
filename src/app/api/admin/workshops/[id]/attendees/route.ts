import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

/**
 * GET /api/admin/workshops/[id]/attendees
 *
 * Returns the list of users registered for a specific workshop, with
 * payment status + registration timestamp. READ-ONLY — does not modify
 * any rows.
 *
 * Auth: ADMIN role required.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const dbUser = await getDbUser();
  if (!dbUser) {
    return NextResponse.json(
      { error: "unauthorized — please sign in" },
      { status: 401 },
    );
  }
  if (dbUser.role !== "ADMIN") {
    return NextResponse.json(
      { error: "forbidden — admin role required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing workshop id" }, { status: 400 });
  }

  try {
    // Verify workshop exists (and pull title/date for the dialog header).
    const workshop = await db.workshop.findUnique({
      where: { id },
      select: { id: true, title: true, date: true },
    });
    if (!workshop) {
      return NextResponse.json({ error: "workshop not found" }, { status: 404 });
    }

    // Pull every registration with the user's display info, ordered by
    // payment status (paid first, then pending, then cancelled), then
    // by registration date.
    const registrations = await db.workshopRegistration.findMany({
      where: { workshopId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [{ paymentStatus: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({
      workshop: {
        id: workshop.id,
        title: workshop.title,
        date: workshop.date,
      },
      attendees: registrations.map((r) => ({
        id: r.id,
        userId: r.user.id,
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone,
        paymentStatus: r.paymentStatus,
        registeredAt: r.createdAt,
      })),
      summary: {
        total: registrations.length,
        paid: registrations.filter((r) => r.paymentStatus === "COMPLETED").length,
        pending: registrations.filter((r) => r.paymentStatus === "PENDING").length,
        cancelled: registrations.filter((r) => r.paymentStatus === "CANCELLED").length,
      },
    });
  } catch (err) {
    console.error("[workshop/attendees] failed:", err);
    return NextResponse.json(
      { error: "Failed to load attendees" },
      { status: 500 },
    );
  }
}
