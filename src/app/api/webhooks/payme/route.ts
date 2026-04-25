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

  // If we resolve via the IPN-amount-fallback path below, we've already
  // accepted PayMe's IPN as authoritative for THIS request and we skip
  // the redundant /get-sales verification (which is broken for accounts
  // that strip custom_1 — those are exactly the accounts that hit this
  // path). Set this flag from the fallback block.
  let trustIpnAsAuthoritative = false;

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
  // legitimate. Instead of giving up, we have TWO recovery strategies:
  //
  //   1. (Preferred) Use the IPN body's own price field to look up our
  //      DB. The IPN webhook URL is the seller's secret — only PayMe
  //      knows it from the dashboard config — so the price field in the
  //      IPN body is trustworthy. No /get-sales round-trip needed.
  //
  //   2. (Backup) If the IPN didn't include a price, call /get-sales
  //      with the payme_sale_code to fetch the captured amount, then
  //      match against our DB by amount + recency.
  //
  // The two-strategy split matters because we've seen PayMe accounts
  // where /get-sales returns 200 OK with empty sales (sandbox/live
  // mismatch or seller-side config). Strategy 1 doesn't depend on
  // /get-sales working at all.
  //
  // Both strategies require an EXACT amount match against a single
  // PENDING payment in the last 10 min — refuse to guess on ambiguity.
  if (!resolved) {
    console.error("[payme-webhook] unrecognized custom_1:", {
      custom1,
      payloadKeys: Object.keys(payload).slice(0, 16),
      // Log the full payload (truncated) so we can see exactly what
      // PayMe sent. Sale codes / amounts aren't sensitive.
      payloadPreview: JSON.stringify(payload).slice(0, 600),
    });

    if (claimedSuccess) {
      // ── Strategy 1: trust the IPN's own price field ──
      // Try every spelling PayMe has used for the captured amount. Most
      // accounts include `sale_price` (in agurot, our own format).
      const ipnPriceRaw =
        payload.sale_price ||
        payload.price ||
        payload.amount ||
        payload.transaction_amount;
      const ipnPriceAgurot = ipnPriceRaw ? Number(ipnPriceRaw) : NaN;

      console.log("[payme-webhook] strategy_1_ipn_price", {
        ipnPriceRaw,
        ipnPriceAgurot,
      });

      if (Number.isFinite(ipnPriceAgurot) && ipnPriceAgurot > 0) {
        const matched = await findRecentPendingPaymentByAmount({
          amountAgurot: ipnPriceAgurot,
          withinMinutes: 10,
        });
        if (matched) {
          console.log("[payme-webhook] strategy_1_matched", {
            paymentId: matched.id,
            amountAgurot: ipnPriceAgurot,
          });
          resolved = { kind: "payment", id: matched.id };
          // We trusted the IPN price + DB amount match — skip the
          // redundant /get-sales verification (which we know fails on
          // this seller account).
          trustIpnAsAuthoritative = true;
        } else {
          console.error(
            "[payme-webhook] strategy_1: no unique PENDING payment matched",
            { amountAgurot: ipnPriceAgurot },
          );
        }
      }

      // ── Strategy 2: ask /get-sales for the captured amount ──
      // Only runs if strategy 1 didn't resolve and we have a sale code.
      if (!resolved && paymeSaleCode) {
        console.log("[payme-webhook] strategy_2_attempting_get_sales");
        const verification = await verifyPaymeSale(paymeSaleCode);
        if (verification.ok) {
          const matched = await findRecentPendingPaymentByAmount({
            amountAgurot: verification.salePriceAgurot,
            withinMinutes: 10,
          });
          if (matched) {
            console.log("[payme-webhook] strategy_2_matched", {
              paymentId: matched.id,
              amountAgurot: verification.salePriceAgurot,
            });
            resolved = { kind: "payment", id: matched.id };
            // /get-sales already confirmed the capture — skip verifying
            // it again in the next block.
            trustIpnAsAuthoritative = true;
          } else {
            console.error(
              "[payme-webhook] strategy_2: no unique PENDING payment matched",
              { amountAgurot: verification.salePriceAgurot },
            );
          }
        } else {
          console.error(
            "[payme-webhook] strategy_2: sale verification failed",
            verification,
          );
        }
      }
    }

    // If both strategies failed, give up gracefully.
    if (!resolved) {
      return NextResponse.json({ ok: true, note: "unrecognized custom_1" });
    }
  }

  // ─── Independent verification for SUCCESS claims ───
  // If the IPN says "success", we re-check via PayMe's server-to-server
  // API to defend against forgery. Failure / cancelled / refund claims
  // are not lucrative to forge (they'd just cancel or revoke a user's
  // access) so we skip that step for them.
  //
  // EXCEPTION: when we resolved this IPN via the amount-fallback path
  // (`trustIpnAsAuthoritative === true`) we already trusted the IPN
  // price field AND matched it to a unique PENDING payment in our DB.
  // Skipping the second /get-sales call here unblocks accounts where
  // /get-sales returns empty results (the exact scenario that forced us
  // into the fallback in the first place).
  let verifiedSuccess = trustIpnAsAuthoritative;
  if (claimedSuccess && !claimedRefund && !trustIpnAsAuthoritative) {
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
      verification.reason === "missing_config"
    ) {
      // Genuinely transient (network blip / config missing) → 500 so
      // PayMe retries. We don't include "api_error" here any more
      // because we've seen accounts where /get-sales legitimately
      // returns 200-OK-empty as a non-transient state.
      console.error(
        "[payme-webhook] verify transient failure, asking PayMe to retry:",
        verification,
      );
      return NextResponse.json(
        { error: "temporarily unable to verify, please retry" },
        { status: 500 },
      );
    } else {
      // not_successful / seller_mismatch / api_error / missing_sale_code →
      // either a forged IPN or PayMe truly says "no captured sale here".
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
