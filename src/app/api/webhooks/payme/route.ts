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
import { verifyPaymeSale } from "@/lib/payme-verify";

/**
 * PayMe IPN (Instant Payment Notification) webhook.
 *
 * Dispatches on the `custom_1` prefix we set in generate-sale:
 *   - "wsr:<id>" → WorkshopRegistration
 *   - "pay:<id>" → Payment (credit / punch-card purchase)
 *
 * Security (C4):
 *   Before trusting any "success" payload, we independently call PayMe's
 *   /api/get-sales to confirm the sale exists for OUR seller UID and is
 *   actually captured. This stops a forged POST with a bogus custom_1
 *   from minting credits. See src/lib/payme-verify.ts for the logic.
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

  const custom1 = payload.custom_1 || payload.customId1 || payload["custom.1"];
  const resolved = resolveCustomRef(custom1);

  if (!resolved) {
    // Unrecognized custom_1 means either a forged/spam IPN or a PayMe
    // feature we don't handle — surface as error so Vercel logs pick it up.
    console.error("[payme-webhook] unrecognized custom_1:", custom1);
    return NextResponse.json({ ok: true, note: "unrecognized custom_1" });
  }

  const claimedSuccess = isPaymeSuccess(payload);
  const claimedFailure = isPaymeFailure(payload);
  const paymeSaleCode = payload.payme_sale_code || payload.sale_code;

  // ─── Independent verification for SUCCESS claims ───
  // If the IPN says "success", we don't trust it — we re-check via PayMe's
  // server-to-server API. Failure / cancelled claims are not lucrative to
  // forge (they'd just cancel a user's registration) so we don't gate
  // those with verification, but we still require a valid custom_1.
  let verifiedSuccess = false;
  if (claimedSuccess) {
    if (!paymeSaleCode) {
      // Success claim without a PayMe sale code is malformed — either a bug
      // on PayMe's side or a forged request. Either way, reject loudly.
      console.error("[payme-webhook] success claim missing payme_sale_code — rejecting");
      return NextResponse.json(
        { error: "missing payme_sale_code" },
        { status: 400 },
      );
    }

    const verification = await verifyPaymeSale(paymeSaleCode);

    if (verification.ok) {
      verifiedSuccess = true;
    } else if (
      verification.reason === "network_error" ||
      verification.reason === "api_error" ||
      verification.reason === "missing_config"
    ) {
      // Can't reach PayMe / transient error → return 500 so PayMe retries
      // later. Better than silently dropping a real payment. PayMe's
      // retry cadence is forgiving (minutes → hours).
      console.error(
        "[payme-webhook] verify transient failure, asking PayMe to retry:",
        verification,
      );
      return NextResponse.json(
        { error: "temporarily unable to verify, please retry" },
        { status: 500 },
      );
    } else {
      // not_successful / seller_mismatch / missing_sale_code →
      // this is either a forged IPN or a payment that didn't truly capture.
      // Reject with 401 and do NOT grant credits.
      console.error("[payme-webhook] verification rejected:", verification);
      return NextResponse.json(
        { error: "verification failed", reason: verification.reason },
        { status: 401 },
      );
    }
  }

  try {
    if (resolved.kind === "workshop") {
      if (verifiedSuccess) {
        await completeWorkshopSuccess(resolved.id);
      } else if (claimedFailure) {
        await cancelWorkshop(resolved.id);
      }
    } else {
      if (verifiedSuccess) {
        await completePaymentSuccess(resolved.id, paymeSaleCode);
      } else if (claimedFailure) {
        await failPayment(resolved.id);
      }
    }
  } catch (err) {
    console.error("[payme-webhook] handler error:", err);
    return NextResponse.json({ ok: true, note: "handler error (logged)" });
  }

  return NextResponse.json({ ok: true });
}

// Some PayMe setups probe the URL with GET first — respond OK.
export async function GET() {
  return NextResponse.json({ ok: true, service: "payme-webhook" });
}
