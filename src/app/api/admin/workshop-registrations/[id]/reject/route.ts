import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { cancelWorkshop } from "@/lib/payments";

/**
 * Admin action: reject a stuck PENDING workshop registration.
 * Sets status → CANCELLED.
 *
 * POST /api/admin/workshop-registrations/<id>/reject
 */

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  await cancelWorkshop(id);
  return NextResponse.json({ ok: true });
}
