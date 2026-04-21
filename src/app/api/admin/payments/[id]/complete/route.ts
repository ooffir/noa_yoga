import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { completePaymentSuccess } from "@/lib/payments";

/**
 * Admin rescue endpoint: manually mark a PENDING Payment as COMPLETED
 * and grant the PunchCard. Used when PayMe's webhook didn't arrive.
 *
 * POST /api/admin/payments/<paymentId>/complete
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

  const result = await completePaymentSuccess(id, null);

  if (result.kind === "not_found") {
    return NextResponse.json({ error: "תשלום לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    status: result.kind,
    credits: "credits" in result ? result.credits : 0,
  });
}
