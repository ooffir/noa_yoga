/**
 * PayMe IPN verification — production-pinned.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  Why hardcoded constants
 * ──────────────────────────────────────────────────────────────────────
 *
 * Earlier diagnostics revealed that this helper was failing with
 * "PayMe returned 200 OK but no matching sale" because the env vars
 * (PAYME_SELLER_UID / PAYME_API_URL) were pointing at sandbox while the
 * actual money was being captured against the production seller UID.
 *
 * To eliminate that whole class of bug, the verification helper now
 * pins the production seller UID and the production /get-sales URL as
 * file-local constants. Env vars are ignored on this code path. If we
 * ever need to verify against sandbox for testing, change the constants
 * directly (or add a separate `verifyPaymeSaleSandbox` helper) — the
 * trade-off here is "fewer footguns" over "configurable".
 *
 * The webhook (src/app/api/webhooks/payme/route.ts) calls this helper
 * as the secondary authenticity check when an MD5 signature isn't
 * available. Pinning to production guarantees that "verification
 * passed" really means "PayMe live confirmed this sale captured for
 * our seller".
 *
 * Docs: https://docs.payme.io
 */

// ── HARDCODED production constants ──
// DO NOT replace these with process.env reads.
// The whole point of this refactor is to make the verification path
// invariant to environment-variable misconfiguration. Sandbox testing
// should use a separate helper, not these constants.
const PRODUCTION_SELLER_UID = "MPL17762-59691SAB-JV1YBNMN-ELCH62AX";
const PRODUCTION_API_URL = "https://live.payme.io/api/get-sales";

// ─────────────────────────────────────────────────────────────────────────────
//  Public types
// ─────────────────────────────────────────────────────────────────────────────

export type PaymeVerifyResult =
  | {
      ok: true;
      saleCode: string;
      saleStatus: string;
      salePriceAgurot: number;
    }
  | {
      ok: false;
      reason:
        | "missing_sale_code"
        | "api_error"
        | "not_successful"
        | "seller_mismatch"
        | "network_error";
      detail?: string;
    };

// ─────────────────────────────────────────────────────────────────────────────
//  verifyPaymeSale — server-to-server lookup against live.payme.io
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a specific sale by its PayMe identifier against the LIVE
 * production endpoint, using the LIVE production seller UID.
 *
 * `saleCode` may come from the IPN body or the return URL — PayMe's
 * field names are inconsistent (`payme_sale_code` / `payme_sale_id` /
 * `sale_code` / `sale_id`), but they all carry the same value, so the
 * caller should pass whichever one they have.
 *
 * Defensive: we send BOTH `payme_sale_code` AND `payme_sale_id` in the
 * request body because PayMe's docs disagree on which one /get-sales
 * filters on. This guarantees the right field name is recognised
 * regardless of the seller account's API-version setting.
 */
export async function verifyPaymeSale(
  saleCode: string,
): Promise<PaymeVerifyResult> {
  console.log("[payme-verify] verifyPaymeSale:start", {
    saleCodePreview: saleCode ? saleCode.slice(0, 8) + "…" : "(empty)",
    forcedApiUrl: PRODUCTION_API_URL,
    forcedSellerUidPrefix: PRODUCTION_SELLER_UID.slice(0, 8) + "…",
  });

  if (!saleCode) {
    console.error("[payme-verify] verifyPaymeSale:missing_sale_code");
    return { ok: false, reason: "missing_sale_code" };
  }

  let response: Response;
  try {
    response = await fetch(PRODUCTION_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        seller_payme_id: PRODUCTION_SELLER_UID,
        payme_sale_code: saleCode,
        payme_sale_id: saleCode,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[payme-verify] verifyPaymeSale:network_error", { detail });
    return { ok: false, reason: "network_error", detail };
  }

  const rawText = await response.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawText);
  } catch {
    const detail = `HTTP ${response.status}, non-JSON body: ${rawText.slice(0, 200)}`;
    console.error("[payme-verify] verifyPaymeSale:parse_error", { detail });
    return { ok: false, reason: "api_error", detail };
  }

  // Always log the FULL response so a single Vercel log entry shows
  // exactly what PayMe returned. Sale codes / amounts are not
  // sensitive — they're already in the merchant dashboard.
  console.log("[payme-verify] verifyPaymeSale:response", {
    httpStatus: response.status,
    statusCode: body.status_code ?? body.statusCode,
    hasSales: Array.isArray(body.sales) ? body.sales.length : "n/a",
    hasSale: !!body.sale,
    rawBodyPreview: rawText.slice(0, 800),
  });

  if (!response.ok) {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`,
    };
  }

  const statusCode = (body.status_code ?? body.statusCode) as
    | number
    | string
    | undefined;
  if (statusCode !== undefined && String(statusCode) !== "0") {
    return {
      ok: false,
      reason: "api_error",
      detail: `PayMe returned status_code=${statusCode}`,
    };
  }

  const sale = extractFirstSale(body);
  if (!sale) {
    console.error("[payme-verify] verifyPaymeSale:no_sale_in_response", {
      bodyShape: {
        hasSales: Array.isArray(body.sales) ? body.sales.length : "n/a",
        hasSale: !!body.sale,
        topLevelKeys: Object.keys(body).slice(0, 12),
      },
    });
    // 200 OK with empty result = "this sale doesn't exist on the LIVE
    // production seller account we just queried". Could mean: the sale
    // really doesn't exist (forged IPN), or — much rarer now that we
    // pin to live — PayMe's API has lag. Treat as not_successful
    // (permanent reject) so the webhook returns 401 instead of 500.
    return {
      ok: false,
      reason: "not_successful",
      detail:
        "PayMe live returned 200 OK but no matching sale (forged IPN or PayMe-side lag)",
    };
  }

  const saleStatus = String(
    sale.sale_status ?? sale.payme_status ?? sale.status ?? "",
  ).toLowerCase();
  const salePriceAgurot = Number(sale.sale_price ?? sale.price ?? 0);
  const saleSellerUid = String(
    sale.seller_payme_id ?? sale.seller_uid ?? "",
  );

  console.log("[payme-verify] verifyPaymeSale:sale", {
    saleStatus,
    salePriceAgurot,
    sellerMatches: !saleSellerUid || saleSellerUid === PRODUCTION_SELLER_UID,
  });

  if (saleSellerUid && saleSellerUid !== PRODUCTION_SELLER_UID) {
    return {
      ok: false,
      reason: "seller_mismatch",
      detail: `response seller=${saleSellerUid.slice(0, 4)}... ours=${PRODUCTION_SELLER_UID.slice(0, 4)}...`,
    };
  }

  // PayMe spellings observed in the wild for "captured":
  //   "captured", "success", "1", "paid", "completed", "approved"
  const isCaptured =
    saleStatus === "captured" ||
    saleStatus === "success" ||
    saleStatus === "paid" ||
    saleStatus === "completed" ||
    saleStatus === "approved" ||
    saleStatus === "1";

  if (!isCaptured) {
    return {
      ok: false,
      reason: "not_successful",
      detail: `PayMe reports status=${saleStatus || "(empty)"}`,
    };
  }

  console.log("[payme-verify] verifyPaymeSale:OK");
  return { ok: true, saleCode, saleStatus, salePriceAgurot };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PayMe's /get-sales response comes in three shapes depending on the
 * seller account's API version. Probe each in priority order and
 * return whichever one carries the sale data.
 */
function extractFirstSale(
  body: Record<string, unknown>,
): Record<string, unknown> | null {
  // Shape 1: { sales: [ { ... } ] }
  if (Array.isArray(body.sales) && body.sales.length > 0) {
    const first = body.sales[0];
    if (first && typeof first === "object")
      return first as Record<string, unknown>;
  }

  // Shape 2: { sale: { ... } }
  if (body.sale && typeof body.sale === "object") {
    return body.sale as Record<string, unknown>;
  }

  // Shape 3: fields on the top-level body (single-sale response)
  if (body.payme_sale_code || body.sale_status || body.sale_price) {
    return body;
  }

  return null;
}
