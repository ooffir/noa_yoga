import { NextResponse } from "next/server";
import {
  completePaymentSuccess,
  completeWorkshopSuccess,
  failPayment,
  cancelWorkshop,
  refundPayment,
  resolveCustomRef,
  findRecentPendingPaymentByAmount,
  isPaymeSuccess,
  isPaymeFailure,
  isPaymeRefund,
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
 * Reliability:
 *   If our DB handler throws, we return HTTP 500 so PayMe retries the
 *   webhook (their schedule is forgiving: minutes → hours). Without this,
 *   transient DB errors would silently drop real payments.
 *
 * Refunds:
 *   When Noa issues a refund in the PayMe dashboard, PayMe sends a
 *   follow-up IPN with `sale_status: "refunded"`. We flip the stored
 *   Payment to REFUNDED and zero-out the associated PunchCard so the
 *   student can't book further classes with revoked credits.
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
  let resolved = resolveCustomRef(custom1);

  const claimedSuccess = isPaymeSuccess(payload);
  const claimedFailure = isPaymeFailure(payload);
  const claimedRefund = isPaymeRefund(payload);
  const paymeSaleCode =
    payload.payme_sale_code ||
    payload.sale_code ||
    payload.payme_sale_id ||
    payload.sale_id;

  // ─── Fallback: amount + timestamp matching when custom_1 is missing ───
  //
  // Some PayMe seller configurations don't echo `custom_1` in the IPN
  // body, so `resolveCustomRef` returns null even though the payment is
  // legitimate. Instead of giving up, we:
  //   1. Verify the sale at PayMe to get the captured amount
  //   2. Look for a single PENDING payment in our DB matching that
  //      amount within the last 10 minutes
  //   3. If found, treat that as the resolved ref and dispatch normally
  //
  // This only kicks in for SUCCESS-claim IPNs because failures and
  // refunds without a custom_1 are not lucrative to forge — and we'd
  // rather log them than risk a false positive on a refund.
  if (!resolved) {
    console.error("[payme-webhook] unrecognized custom_1:", {
      custom1,
      payloadKeys: Object.keys(payload).slice(0, 12),
    });

    if (claimedSuccess && paymeSaleCode) {
      console.log("[payme-webhook] attempting amount-fallback match");
      const verification = await verifyPaymeSale(paymeSaleCode);
      if (verification.ok) {
        const matched = await findRecentPendingPaymentByAmount({
          amountAgurot: verification.salePriceAgurot,
          withinMinutes: 10,
        });
        if (matched) {
          // Synthesize a resolved ref pointing at the matched payment so
          // the rest of the dispatcher works without changes.
          console.log("[payme-webhook] amount-fallback matched payment", {
            paymentId: matched.id,
            amountAgurot: verification.salePriceAgurot,
          });
          resolved = { kind: "payment", id: matched.id };
        } else {
          console.error(
            "[payme-webhook] amount-fallback: no unique PENDING payment matched",
            { amountAgurot: verification.salePriceAgurot },
          );
        }
      } else {
        console.error(
          "[payme-webhook] amount-fallback: sale verification failed",
          verification,
        );
      }
    }

    // If still unresolved after the fallback attempt, give up gracefully.
    if (!resolved) {
      return NextResponse.json({ ok: true, note: "unrecognized custom_1" });
    }
  }

  // ─── Independent verification for SUCCESS claims ───
  // If the IPN says "success", we don't trust it — we re-check via PayMe's
  // server-to-server API. Failure / cancelled / refund claims are not
  // lucrative to forge (they'd just cancel or revoke a user's access) so
  // we skip that step for them, but we still require a valid custom_1.
  let verifiedSuccess = false;
  if (claimedSuccess && !claimedRefund) {
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
      // later. Better than silently dropping a real payment.
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

  // ─── Dispatch ───
  // Any handler failure below returns 500 so PayMe will retry. Previous
  // behavior (return 200 on error) silently dropped real payments — the
  // admin rescue page was the only fix. We prefer the provider's own
  // retry mechanism which is designed for exactly this case.
  try {
    if (resolved.kind === "workshop") {
      if (claimedRefund) {
        // Workshop refunds: mark the registration cancelled. The actual
        // card-side refund is done by Noa in the PayMe dashboard — this
        // just keeps our DB in sync so the student's seat is released.
        await cancelWorkshop(resolved.id);
      } else if (verifiedSuccess) {
        await completeWorkshopSuccess(resolved.id);
      } else if (claimedFailure) {
        await cancelWorkshop(resolved.id);
      }
    } else {
      if (claimedRefund) {
        await refundPayment(resolved.id);
      } else if (verifiedSuccess) {
        await completePaymentSuccess(resolved.id, paymeSaleCode);
      } else if (claimedFailure) {
        await failPayment(resolved.id);
      }
    }
  } catch (err) {
    // Let PayMe retry. Every handler here is idempotent so retries are safe.
    console.error("[payme-webhook] handler failed — returning 500 for retry:", err);
    return NextResponse.json(
      { error: "handler error — please retry" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

// Some PayMe setups probe the URL with GET first — respond OK.
export async function GET() {
  return NextResponse.json({ ok: true, service: "payme-webhook" });
}
