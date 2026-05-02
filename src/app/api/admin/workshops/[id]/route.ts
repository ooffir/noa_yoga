import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { dbErrorResponse } from "@/lib/db-errors";
import {
  sendTransactionalEmail,
  workshopCancellationEmail,
} from "@/lib/email";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { title, description, date, price, imageUrl, maxCapacity } = await req.json();

    const workshop = await db.workshop.update({
      where: { id },
      data: {
        title,
        description,
        date: date ? new Date(date) : undefined,
        price: price != null ? Number(price) : undefined,
        imageUrl: imageUrl || null,
        maxCapacity: maxCapacity ? Number(maxCapacity) : null,
      },
    });

    revalidatePath("/workshops");
    return NextResponse.json(workshop);
  } catch (err) {
    console.error("[admin/workshops PUT] failed:", err);
    const { message, status } = dbErrorResponse(err, "עדכון נכשל");
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Delete (deactivate) a workshop.
 *
 * Cascade in a single transaction:
 *   1. Flip workshop.isActive → false (hides it from /workshops list).
 *   2. Flip every non-CANCELLED registration → CANCELLED.
 *   3. Collect the list of affected students for email dispatch.
 *
 * The actual card-side refund for COMPLETED registrations must be
 * processed by Noa in the PayMe dashboard — we can't do card refunds
 * programmatically on this provider. The email tells the student the
 * refund is on its way.
 *
 * If email sending fails afterwards, the DB state is still correct —
 * Noa can resend manually from the admin UI if needed.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const { workshop, affected } = await db.$transaction(async (tx) => {
      const workshop = await tx.workshop.findUnique({
        where: { id },
        include: {
          registrations: {
            where: { paymentStatus: { not: "CANCELLED" } },
            include: {
              user: {
                select: { email: true, name: true },
              },
            },
          },
        },
      });
      if (!workshop) throw new Error("הסדנה לא נמצאה");

      await tx.workshop.update({
        where: { id },
        data: { isActive: false },
      });

      // Mark every open/paid registration as cancelled so the student's
      // seat is freed and the UI reflects the new state.
      if (workshop.registrations.length > 0) {
        await tx.workshopRegistration.updateMany({
          where: {
            workshopId: id,
            paymentStatus: { not: "CANCELLED" },
          },
          data: { paymentStatus: "CANCELLED" },
        });
      }

      return {
        workshop: {
          title: workshop.title,
          date: workshop.date,
          price: workshop.price,
        },
        affected: workshop.registrations.map((r) => ({
          email: r.user.email,
          name: r.user.name,
          wasPaid: r.paymentStatus === "COMPLETED",
        })),
      };
    }, { isolationLevel: "Serializable", timeout: 15_000 });

    // Email each affected student. Only PAID students need the refund
    // notice — PENDING ones haven't been charged. Fire-and-forget so
    // SMTP hiccups don't revert the DB change.
    for (const student of affected) {
      if (!student.wasPaid) continue;
      try {
        const { subject, html } = workshopCancellationEmail({
          name: student.name || "תלמידה יקרה",
          workshopTitle: workshop.title,
          workshopDate: workshop.date,
          amountIls: workshop.price,
        });
        sendTransactionalEmail({ to: student.email, subject, html }).catch(
          (err) =>
            console.error(
              "[admin/workshops DELETE] email failed:",
              err?.message || err,
            ),
        );
      } catch (err) {
        console.error("[admin/workshops DELETE] email build failed:", err);
      }
    }

    revalidatePath("/workshops");
    return NextResponse.json({
      deactivated: true,
      cancelled: affected.length,
      paidAffected: affected.filter((a) => a.wasPaid).length,
    });
  } catch (err) {
    console.error("[admin/workshops DELETE] failed:", err);
    const { message, status } = dbErrorResponse(err, "מחיקה נכשלה");
    return NextResponse.json({ error: message }, { status });
  }
}
