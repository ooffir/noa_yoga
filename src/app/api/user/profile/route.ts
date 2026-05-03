import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import { isNameValid, isPhoneValid } from "@/lib/profile-validation";
import { dbErrorResponse } from "@/lib/db-errors";

/**
 * GET /api/user/profile
 *
 * Returns the current user's editable profile fields. The frontend
 * uses this to pre-fill the profile-completion modal AND to know
 * whether the gate needs to fire at all.
 *
 * PATCH /api/user/profile
 *
 * Updates `name` and `phone` (the only fields editable by the user
 * themselves on this endpoint — email is owned by Clerk, role is
 * admin-only, credits are accounting-driven).
 *
 * Validation is shared with the client via `lib/profile-validation`
 * so both surfaces accept exactly the same inputs.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getDbUser();
    if (!user) {
      return NextResponse.json({ error: "יש להתחבר תחילה" }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
    });
  } catch (err) {
    console.error("[user/profile GET] failed:", err);
    const { message, status } = dbErrorResponse(err, "שגיאה בטעינת הפרופיל");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getDbUser();
    if (!user) {
      return NextResponse.json({ error: "יש להתחבר תחילה" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }

    const input = body as Record<string, unknown>;

    // Validate exactly the fields we plan to write — no surprises.
    const data: { name?: string; phone?: string } = {};

    if (input.name !== undefined) {
      if (typeof input.name !== "string" || !isNameValid(input.name)) {
        return NextResponse.json(
          { error: "שם לא תקין (לפחות 2 תווים)" },
          { status: 400 },
        );
      }
      data.name = input.name.trim();
    }

    if (input.phone !== undefined) {
      if (typeof input.phone !== "string" || !isPhoneValid(input.phone)) {
        return NextResponse.json(
          { error: "מספר טלפון לא תקין (לפחות 9 ספרות)" },
          { status: 400 },
        );
      }
      // Persist the user's exact formatting; we don't want to silently
      // strip dashes someone wrote on purpose.
      data.phone = input.phone.trim();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: { id: true, name: true, phone: true, email: true },
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (err) {
    console.error("[user/profile PATCH] failed:", err);
    const { message, status } = dbErrorResponse(err, "עדכון נכשל");
    return NextResponse.json({ error: message }, { status });
  }
}
