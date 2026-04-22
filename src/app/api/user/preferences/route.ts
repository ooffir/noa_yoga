import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

/**
 * PATCH /api/user/preferences
 *
 * Updates the current user's non-critical account preferences.
 * Currently the only field is `receiveEmails` (marketing/operational
 * email opt-in/out).
 *
 * Payment receipts are NOT gated by this flag — they're sent via
 * `sendTransactionalEmail` which bypasses the opt-out per consumer law.
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
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

  // Only whitelisted fields can be updated through this endpoint —
  // never trust arbitrary keys from the client.
  const data: { receiveEmails?: boolean } = {};
  if (typeof input.receiveEmails === "boolean") {
    data.receiveEmails = input.receiveEmails;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: { id: true, receiveEmails: true },
  });

  return NextResponse.json({ ok: true, user: updated });
}
