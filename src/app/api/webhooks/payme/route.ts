import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

/**
 * PayMe IPN (Instant Payment Notification) webhook.
 *
 * PayMe calls this endpoint on the `sale_callback_url` we registered.
 * The body may arrive as JSON or as `application/x-www-form-urlencoded`
 * depending on the PayMe configuration — we handle both.
 *
 * Key fields we rely on:
 *   - payme_status       : "success" / "failed" / etc.
 *   - payme_sale_code    : PayMe's transaction id
 *   - custom_1           : our WorkshopRegistration.id (round-tripped from generate-sale)
 *
 * Security note:
 *   For production, add signature verification via PayMe's `verify-sale`
 *   API (https://developers.paymeservice.com/) — or HMAC if enabled on
 *   your merchant account. The current implementation trusts `custom_1`
 *   + status, which is sufficient for staging/preprod.
 */

export const dynamic = "force-dynamic";

type PaymePayload = Record<string, string | undefined>;

async function parseBody(req: Request): Promise<PaymePayload> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const json = (await req.json()) as Record<string, unknown>;
      const out: PaymePayload = {};
      for (const [k, v] of Object.entries(json)) {
        if (v !== undefined && v !== null) out[k] = String(v);
      }
      return out;
    } catch {
      return {};
    }
  }

  // form-urlencoded or multipart/form-data
  try {
    const form = await req.formData();
    const out: PaymePayload = {};
    for (const [k, v] of form.entries()) {
      out[k] = typeof v === "string" ? v : "";
    }
    return out;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const payload = await parseBody(req);

  const status = (payload.payme_status || payload.status || "").toLowerCase();
  const registrationId = payload.custom_1 || payload.customId1 || "";
  const paymeSaleCode = payload.payme_sale_code || payload.sale_code;

  console.log("[payme-webhook]", {
    status,
    registrationId,
    paymeSaleCode,
    keys: Object.keys(payload),
  });

  if (!registrationId) {
    return NextResponse.json(
      { error: "custom_1 (registrationId) missing" },
      { status: 400 },
    );
  }

  // Verify the registration exists before we touch it
  const registration = await db.workshopRegistration.findUnique({
    where: { id: registrationId },
    include: { workshop: { select: { id: true, title: true } } },
  });

  if (!registration) {
    console.warn("[payme-webhook] registration not found:", registrationId);
    // 200 so PayMe stops retrying; we log the issue server-side.
    return NextResponse.json({ ok: true, note: "registration not found" });
  }

  // Map PayMe status → our enum.
  // PayMe documents success as `payme_status === "success"`. Some integrations
  // also return `status_code: 0` alongside; we accept either signal.
  const isSuccess =
    status === "success" ||
    payload.status_code === "0" ||
    payload.payme_status === "1";

  if (isSuccess) {
    if (registration.paymentStatus !== "COMPLETED") {
      await db.workshopRegistration.update({
        where: { id: registration.id },
        data: { paymentStatus: "COMPLETED" },
      });
      console.log("[payme-webhook] registration COMPLETED:", registration.id);
    }
  } else if (status === "failed" || status === "cancelled" || status === "error") {
    if (registration.paymentStatus === "PENDING") {
      await db.workshopRegistration.update({
        where: { id: registration.id },
        data: { paymentStatus: "CANCELLED" },
      });
      console.log("[payme-webhook] registration CANCELLED:", registration.id);
    }
  }

  // Revalidate so the public workshops list reflects the new count.
  revalidatePath("/workshops");

  // PayMe requires a 2xx response to stop retrying.
  return NextResponse.json({ ok: true });
}

// Some PayMe setups probe the URL with GET first — respond OK.
export async function GET() {
  return NextResponse.json({ ok: true });
}
