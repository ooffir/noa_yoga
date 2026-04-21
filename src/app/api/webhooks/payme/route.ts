import { NextResponse } from "next/server";
import {
  completePaymentSuccess,
  completeWorkshopSuccess,
  failPayment,
  cancelWorkshop,
  resolveCustomRef,
  isPaymeSuccess,
  isPaymeFailure,
} from "@/lib/payments";

/**
 * PayMe IPN (Instant Payment Notification) webhook.
 *
 * Dispatches on the `custom_1` prefix we set in generate-sale:
 *   - "wsr:<id>" → WorkshopRegistration
 *   - "pay:<id>" → Payment (credit / punch-card purchase)
 *
 * Business logic lives in `src/lib/payments.ts` so the /payments/success
 * return-URL page can use the same idempotent completion helpers if the
 * webhook is delayed or missing.
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

export async function POST(req: Request) {
  const payload = await parseBody(req);

  // Log EVERY webhook call with full payload (masked sensitive data would be
  // ideal, but PayMe doesn't send raw card data — only the sale code). This
  // is crucial for diagnosing "payment succeeded but no credits" reports.
  console.log("[payme-webhook] received:", {
    fields: Object.keys(payload),
    custom_1: payload.custom_1,
    payme_status: payload.payme_status,
    status: payload.status,
    status_code: payload.status_code,
    payme_sale_code: payload.payme_sale_code,
    sale_code: payload.sale_code,
  });

  const custom1 = payload.custom_1 || payload.customId1 || payload["custom.1"];
  const resolved = resolveCustomRef(custom1);

  if (!resolved) {
    console.warn("[payme-webhook] unrecognized custom_1:", custom1);
    // Still 200 so PayMe doesn't retry forever.
    return NextResponse.json({ ok: true, note: "unrecognized custom_1" });
  }

  const success = isPaymeSuccess(payload);
  const failure = isPaymeFailure(payload);
  const paymeSaleCode = payload.payme_sale_code || payload.sale_code;

  console.log("[payme-webhook] dispatching:", {
    kind: resolved.kind,
    id: resolved.id,
    success,
    failure,
  });

  try {
    if (resolved.kind === "workshop") {
      if (success) {
        await completeWorkshopSuccess(resolved.id);
      } else if (failure) {
        await cancelWorkshop(resolved.id);
      }
    } else {
      if (success) {
        await completePaymentSuccess(resolved.id, paymeSaleCode);
      } else if (failure) {
        await failPayment(resolved.id);
      }
    }
  } catch (err) {
    console.error("[payme-webhook] handler error:", err);
    // Still 200 — PayMe doesn't need to retry. We'll catch the missed
    // completion on the /payments/success or /workshops return page.
    return NextResponse.json({ ok: true, note: "handler error (logged)" });
  }

  return NextResponse.json({ ok: true });
}

// Some PayMe setups probe the URL with GET first — respond OK.
export async function GET() {
  return NextResponse.json({ ok: true, service: "payme-webhook" });
}
