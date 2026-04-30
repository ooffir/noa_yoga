import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import {
  completePaymentSuccess,
  completeWorkshopSuccess,
  failPayment,
  cancelWorkshop,
  refundPayment,
} from "@/lib/payments";
import { verifyPaymeSale } from "@/lib/payme-verify";

/**
 * PayMe IPN (Instant Payment Notification) webhook — production-stable refactor.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  Dispatch model
 * ──────────────────────────────────────────────────────────────────────
 *
 * Every successful sale carries a `transaction_id` field that we set
 * during /api/generate-sale. It's our internal DB primary key — either
 * a Payment.id or a WorkshopRegistration.id (both are UUIDs, no
 * collisions). The webhook:
 *   1. Parses the body (JSON or x-www-form-urlencoded).
 *   2. Extracts `transaction_id`.
 *   3. Looks it up in `payments` first; if not found, in `workshop_registrations`.
 *   4. Verifies authenticity (MD5 if provided, else server-to-server API).
 *   5. Dispatches success / failure / refund.
 *
 * Idempotent by design: if the row is already in a terminal state
 * (COMPLETED / REFUNDED / CANCELLED), we return 200 OK without touching
 * the DB. PayMe can re-deliver the IPN any number of times safely.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  Verification
 * ──────────────────────────────────────────────────────────────────────
 *
 *   • If PayMe sends a signature (e.g. `payme_signature`) AND we have
 *     `PAYME_SECRET_KEY` in env, we verify the MD5 ourselves — the
 *     fastest and most authoritative check.
 *   • Otherwise we fall back to a server-to-server call to PayMe's
 *     /get-sales endpoint with the `payme_sale_code`. Confirms the sale
 *     truly captured for OUR seller before crediting.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  HTTP semantics
 * ──────────────────────────────────────────────────────────────────────
 *
 *   200 → handled (or already terminal). PayMe stops retrying.
 *   400 → IPN malformed (missing transaction_id). PayMe stops retrying.
 *   401 → verification failed. We don't credit. PayMe stops retrying.
 *   404 → transaction_id not found in DB. PayMe stops retrying.
 *   500 → transient (DB/network). PayMe SHOULD retry.
 */

export const dynamic = "force-dynamic";

type PaymePayload = Record<string, string | undefined>;

// ─────────────────────────────────────────────────────────────────────
//  Body parsing
// ─────────────────────────────────────────────────────────────────────
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

  // application/x-www-form-urlencoded or multipart/form-data
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

// ─────────────────────────────────────────────────────────────────────
//  Status detectors — multiple field-name variants observed in production
// ─────────────────────────────────────────────────────────────────────
function isSuccess(payload: PaymePayload): boolean {
  const candidates = [
    payload.payme_status,
    payload.status,
    payload.sale_status,
    payload.transaction_status,
    payload.payment_status,
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());

  return candidates.some((s) =>
    [
      "success",
      "succeed",
      "successful",
      "captured",
      "capture",
      "paid",
      "approved",
      "completed",
      "done",
      "1",
    ].includes(s),
  );
}

function isFailure(payload: PaymePayload): boolean {
  const status = (
    payload.payme_status ||
    payload.status ||
    payload.sale_status ||
    ""
  ).toLowerCase();
  return ["failed", "failure", "cancelled", "canceled", "error"].includes(
    status,
  );
}

function isRefund(payload: PaymePayload): boolean {
  const status = (
    payload.payme_sale_status ||
    payload.sale_status ||
    payload.payme_status ||
    payload.status ||
    ""
  ).toLowerCase();
  const type = (payload.type || payload.event || "").toLowerCase();
  return status === "refunded" || status === "refund" || type === "refund";
}

// ─────────────────────────────────────────────────────────────────────
//  MD5 signature verification (if PayMe sends it)
// ─────────────────────────────────────────────────────────────────────
type SignatureResult = "valid" | "invalid" | "skipped";

/**
 * Verify the IPN's MD5 signature against PAYME_SECRET_KEY.
 *
 * Returns:
 *   - "valid"   — signature matched
 *   - "invalid" — signature provided but didn't match (probably forged)
 *   - "skipped" — no signature in payload OR no secret in env; caller
 *                 should fall back to server-to-server API verification
 *
 * Signing convention (PayMe's documented format for HPP):
 *   md5(payme_sale_code + sale_price + currency + secret_key)
 *
 * If your account uses a different signing string, adjust the assembly
 * below. The function logs the components on a mismatch so you can
 * diagnose in 30 seconds.
 */
function verifyMd5Signature(payload: PaymePayload): SignatureResult {
  const provided =
    payload.payme_signature || payload.signature || payload.md5_signature;
  if (!provided) return "skipped";

  const secret = process.env.PAYME_SECRET_KEY?.trim();
  if (!secret) {
    console.warn(
      "[payme-webhook] IPN includes signature but PAYME_SECRET_KEY is not set — falling back to API verification",
    );
    return "skipped";
  }

  const saleCode =
    payload.payme_sale_code ||
    payload.sale_code ||
    payload.payme_sale_id ||
    payload.sale_id ||
    "";
  const salePrice = payload.sale_price || payload.amount || "";
  const currency = payload.currency || "ILS";

  const signingString = `${saleCode}${salePrice}${currency}${secret}`;
  const expected = crypto
    .createHash("md5")
    .update(signingString)
    .digest("hex");

  const matches = provided.toLowerCase() === expected.toLowerCase();

  if (!matches) {
    console.error("[payme-webhook] MD5 mismatch", {
      provided: provided.slice(0, 8) + "…",
      expected: expected.slice(0, 8) + "…",
      // Don't log the full secret or signing string in production.
      saleCodePrefix: saleCode.slice(0, 8) + "…",
      salePrice,
      currency,
    });
  }

  return matches ? "valid" : "invalid";
}

// ─────────────────────────────────────────────────────────────────────
//  Handler
// ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const payload = await parseBody(req);
  const contentType = req.headers.get("content-type") || "";

  // 1. Extract transaction_id (our DB primary key).
  const transactionId =
    payload.transaction_id || payload.transactionId;

  if (!transactionId) {
    console.error("[payme-webhook] missing transaction_id", {
      contentType,
      payloadKeys: Object.keys(payload),
      payloadPreview: JSON.stringify(payload).slice(0, 400),
    });
    return NextResponse.json(
      { error: "missing transaction_id" },
      { status: 400 },
    );
  }

  console.log("[payme-webhook] received", {
    contentType,
    transactionId,
    payloadKeys: Object.keys(payload),
  });

  const claimedSuccess = isSuccess(payload);
  const claimedFailure = isFailure(payload);
  const claimedRefund = isRefund(payload);
  const paymeSaleCode =
    payload.payme_sale_code ||
    payload.sale_code ||
    payload.payme_sale_id ||
    payload.sale_id;

  // 2. Look up the entity in DB. Payment first, then WorkshopRegistration.
  //    Both are UUIDs (different namespaces, no collisions possible).
  const payment = await db.payment.findUnique({
    where: { id: transactionId },
    select: { id: true, status: true },
  });

  let workshopReg: { id: string; paymentStatus: string } | null = null;
  if (!payment) {
    workshopReg = await db.workshopRegistration.findUnique({
      where: { id: transactionId },
      select: { id: true, paymentStatus: true },
    });
  }

  if (!payment && !workshopReg) {
    console.error("[payme-webhook] transaction_id not found in DB", {
      transactionId,
    });
    return NextResponse.json(
      { error: "transaction not found" },
      { status: 404 },
    );
  }

  // 3. Idempotency — if already terminal, return 200 immediately with
  //    NO DB writes. PayMe can re-deliver the IPN any number of times
  //    without side effects.
  if (payment) {
    if (payment.status === "COMPLETED" || payment.status === "REFUNDED") {
      console.log("[payme-webhook] payment already terminal — idempotent OK", {
        transactionId,
        status: payment.status,
      });
      return NextResponse.json({
        ok: true,
        status: payment.status,
        idempotent: true,
      });
    }
  } else if (workshopReg) {
    if (
      workshopReg.paymentStatus === "COMPLETED" ||
      workshopReg.paymentStatus === "CANCELLED"
    ) {
      console.log(
        "[payme-webhook] workshop reg already terminal — idempotent OK",
        { transactionId, status: workshopReg.paymentStatus },
      );
      return NextResponse.json({
        ok: true,
        status: workshopReg.paymentStatus,
        idempotent: true,
      });
    }
  }

  // 4. Verify authenticity for SUCCESS claims (skip for failure/refund
  //    — those are not lucrative to forge).
  if (claimedSuccess && !claimedRefund) {
    const md5Result = verifyMd5Signature(payload);

    if (md5Result === "invalid") {
      console.error("[payme-webhook] MD5 signature invalid — rejecting", {
        transactionId,
      });
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }

    if (md5Result === "skipped") {
      // Fall back to server-to-server API verification.
      if (!paymeSaleCode) {
        console.error(
          "[payme-webhook] success claim missing both signature and sale code",
          { transactionId },
        );
        return NextResponse.json(
          { error: "no verifiable identifier" },
          { status: 400 },
        );
      }

      const apiResult = await verifyPaymeSale(paymeSaleCode);

      if (!apiResult.ok) {
        if (
          apiResult.reason === "network_error" ||
          apiResult.reason === "missing_config"
        ) {
          // Transient — let PayMe retry.
          console.error(
            "[payme-webhook] API verification transient failure",
            apiResult,
          );
          return NextResponse.json(
            { error: "transient verification failure" },
            { status: 500 },
          );
        }

        // Permanent — forged or capture didn't actually happen.
        console.error("[payme-webhook] API verification rejected", {
          transactionId,
          apiResult,
        });
        return NextResponse.json(
          { error: "verification failed", reason: apiResult.reason },
          { status: 401 },
        );
      }

      console.log("[payme-webhook] API verification OK", {
        transactionId,
        saleStatus: apiResult.saleStatus,
      });
    } else {
      console.log("[payme-webhook] MD5 signature OK", { transactionId });
    }
  }

  // 5. Dispatch. Any handler failure throws → caught below → 500 retry.
  try {
    if (payment) {
      if (claimedRefund) {
        await refundPayment(transactionId);
        console.log("[payme-webhook] payment refunded", { transactionId });
      } else if (claimedSuccess) {
        await completePaymentSuccess(transactionId, paymeSaleCode);
        console.log("[payme-webhook] payment completed", { transactionId });
      } else if (claimedFailure) {
        await failPayment(transactionId);
        console.log("[payme-webhook] payment marked failed", { transactionId });
      } else {
        // Ambiguous IPN (no positive or negative claim) — treat as no-op.
        console.warn("[payme-webhook] payment IPN ambiguous, no-op", {
          transactionId,
          payloadKeys: Object.keys(payload),
        });
      }
    } else if (workshopReg) {
      if (claimedRefund) {
        await cancelWorkshop(transactionId);
        console.log("[payme-webhook] workshop refunded/cancelled", {
          transactionId,
        });
      } else if (claimedSuccess) {
        await completeWorkshopSuccess(transactionId);
        console.log("[payme-webhook] workshop completed", { transactionId });
      } else if (claimedFailure) {
        await cancelWorkshop(transactionId);
        console.log("[payme-webhook] workshop marked cancelled", {
          transactionId,
        });
      } else {
        console.warn("[payme-webhook] workshop IPN ambiguous, no-op", {
          transactionId,
        });
      }
    }
  } catch (err) {
    console.error(
      "[payme-webhook] handler error — returning 500 for retry:",
      err,
    );
    return NextResponse.json(
      { error: "handler error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

// PayMe sometimes pings with GET to verify the URL is reachable.
export async function GET() {
  return NextResponse.json({ ok: true, service: "payme-webhook" });
}
