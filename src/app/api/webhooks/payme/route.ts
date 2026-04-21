import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

/**
 * PayMe IPN (Instant Payment Notification) webhook.
 *
 * Dispatches on the `custom_1` prefix we set in generate-sale:
 *   - "wsr:<id>"  → WorkshopRegistration
 *   - "pay:<id>"  → Payment (credit / punch-card purchase)
 *
 * Legacy (pre-prefix) workshop payloads fall back to WorkshopRegistration
 * lookup so in-flight sales aren't lost during the cutover.
 *
 * Security: for production, add signature verification via PayMe's
 * `verify-sale` API (https://developers.paymeservice.com/).
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

type SaleKind = "workshop" | "payment";
interface ResolvedCustom {
  kind: SaleKind;
  id: string;
}

function resolveCustomRef(custom1: string): ResolvedCustom | null {
  if (custom1.startsWith("wsr:")) {
    return { kind: "workshop", id: custom1.slice(4) };
  }
  if (custom1.startsWith("pay:")) {
    return { kind: "payment", id: custom1.slice(4) };
  }
  // Legacy: raw UUID (old workshop registrations before prefix migration).
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(custom1)) {
    return { kind: "workshop", id: custom1 };
  }
  return null;
}

async function handleWorkshopRegistration(id: string, isSuccess: boolean, isFailure: boolean) {
  const registration = await db.workshopRegistration.findUnique({
    where: { id },
    include: { workshop: { select: { title: true } } },
  });
  if (!registration) {
    console.warn("[payme-webhook] workshop registration not found:", id);
    return;
  }

  if (isSuccess && registration.paymentStatus !== "COMPLETED") {
    await db.workshopRegistration.update({
      where: { id: registration.id },
      data: { paymentStatus: "COMPLETED" },
    });
    console.log("[payme-webhook] workshop COMPLETED:", registration.id);
  } else if (isFailure && registration.paymentStatus === "PENDING") {
    await db.workshopRegistration.update({
      where: { id: registration.id },
      data: { paymentStatus: "CANCELLED" },
    });
    console.log("[payme-webhook] workshop CANCELLED:", registration.id);
  }
}

async function handlePayment(
  id: string,
  paymeSaleCode: string | undefined,
  isSuccess: boolean,
  isFailure: boolean,
) {
  const payment = await db.payment.findUnique({ where: { id } });
  if (!payment) {
    console.warn("[payme-webhook] payment not found:", id);
    return;
  }

  if (isSuccess) {
    if (payment.status === "COMPLETED") {
      console.log("[payme-webhook] payment already COMPLETED (idempotent):", payment.id);
      return;
    }

    // Atomic-ish: flip the payment AND grant the credits in a single transaction.
    const credits = payment.type === "PUNCH_CARD" ? 10 : 1;
    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: "COMPLETED",
          paymentPageUid: paymeSaleCode ?? payment.paymentPageUid,
        },
      }),
      db.punchCard.create({
        data: {
          userId: payment.userId,
          totalCredits: credits,
          remainingCredits: credits,
          paymentId: payment.id,
        },
      }),
    ]);

    console.log("[payme-webhook] payment COMPLETED:", payment.id, `+${credits} credits`);
  } else if (isFailure && payment.status === "PENDING") {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    console.log("[payme-webhook] payment FAILED:", payment.id);
  }
}

export async function POST(req: Request) {
  const payload = await parseBody(req);

  const status = (payload.payme_status || payload.status || "").toLowerCase();
  const custom1 = payload.custom_1 || payload.customId1 || "";
  const paymeSaleCode = payload.payme_sale_code || payload.sale_code;

  console.log("[payme-webhook] received:", {
    status,
    custom1,
    paymeSaleCode,
    keys: Object.keys(payload),
  });

  if (!custom1) {
    return NextResponse.json(
      { error: "custom_1 missing" },
      { status: 400 },
    );
  }

  const resolved = resolveCustomRef(custom1);
  if (!resolved) {
    console.warn("[payme-webhook] unrecognized custom_1 format:", custom1);
    return NextResponse.json({ ok: true, note: "unrecognized ref" });
  }

  const isSuccess =
    status === "success" ||
    payload.status_code === "0" ||
    payload.payme_status === "1";
  const isFailure =
    status === "failed" || status === "cancelled" || status === "error";

  try {
    if (resolved.kind === "workshop") {
      await handleWorkshopRegistration(resolved.id, isSuccess, isFailure);
      revalidatePath("/workshops");
    } else {
      await handlePayment(resolved.id, paymeSaleCode, isSuccess, isFailure);
      revalidatePath("/profile");
    }
  } catch (err) {
    console.error("[payme-webhook] handler error:", err);
    // Still 200 so PayMe doesn't retry forever — we've logged server-side.
    return NextResponse.json({ ok: true, note: "handler error (logged)" });
  }

  return NextResponse.json({ ok: true });
}

// Some PayMe setups probe the URL with GET first — respond OK.
export async function GET() {
  return NextResponse.json({ ok: true });
}
