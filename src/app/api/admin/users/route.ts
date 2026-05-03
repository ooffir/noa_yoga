import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { dbErrorResponse } from "@/lib/db-errors";
import { isNameValid, isPhoneValid } from "@/lib/profile-validation";

export async function GET() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Show ALL registered users (admins + students). The UI tags them by role
    // so the admin can see who signed up and manage their credits if needed.
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        credits: true,
        createdAt: true,
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
        punchCards: {
          where: { status: "ACTIVE" },
          select: { remainingCredits: true },
        },
      },
      // Admins first, then alphabetical — keeps the studio owner's row on top.
      orderBy: [{ role: "desc" }, { name: "asc" }, { email: "asc" }],
    });

    return NextResponse.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        credits: u.credits + u.punchCards.reduce((s, pc) => s + pc.remainingCredits, 0),
        directCredits: u.credits,
        punchCardCredits: u.punchCards.reduce((s, pc) => s + pc.remainingCredits, 0),
        totalBookings: u._count.bookings,
        createdAt: u.createdAt,
      }))
    );
  } catch (err) {
    console.error("[admin/users GET] failed:", err);
    const { message, status } = dbErrorResponse(err, "שגיאה");
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH — admin can adjust a user's `credits`, `name`, or `phone`.
 *
 * Body shape (any subset is allowed; at least one editable field required):
 *   {
 *     userId: string,
 *     credits?: number,
 *     name?: string,
 *     phone?: string,
 *   }
 *
 * Validation mirrors the user-side endpoint at /api/user/profile so a
 * student can never end up with admin-set values that fail their own
 * client-side validation later.
 */
export async function PATCH(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId : null;
    if (!userId) {
      return NextResponse.json({ error: "נתונים חסרים" }, { status: 400 });
    }

    const data: { credits?: number; name?: string; phone?: string } = {};

    if (typeof body.credits === "number") {
      data.credits = Math.max(0, Math.floor(body.credits));
    }

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !isNameValid(body.name)) {
        return NextResponse.json(
          { error: "שם לא תקין (לפחות 2 תווים)" },
          { status: 400 },
        );
      }
      data.name = body.name.trim();
    }

    if (body.phone !== undefined) {
      // Allow blanking the phone (admin removing a user's phone). For
      // any non-empty value, enforce the same rule as the student-side
      // PATCH so values stay consistent across surfaces.
      if (typeof body.phone !== "string") {
        return NextResponse.json(
          { error: "מספר טלפון לא תקין" },
          { status: 400 },
        );
      }
      const trimmed = body.phone.trim();
      if (trimmed === "") {
        data.phone = "";
      } else {
        if (!isPhoneValid(trimmed)) {
          return NextResponse.json(
            { error: "מספר טלפון לא תקין (לפחות 9 ספרות)" },
            { status: 400 },
          );
        }
        data.phone = trimmed;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        phone: true,
        credits: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[admin/users PATCH] failed:", err);
    const { message, status } = dbErrorResponse(err, "עדכון נכשל");
    return NextResponse.json({ error: message }, { status });
  }
}
