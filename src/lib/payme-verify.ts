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
 * To eliminate that whole class of bug, the verification helper pins
 * the production seller UID and the production /get-sales URL as
 * file-local constants. Env vars are ignored on this code path. If we
 * ever need to verify against sandbox for testing, change the constants
 * directly (or add a separate sandbox helper).
 *
 * ──────────────────────────────────────────────────────────────────────
 *  Response shape — what live.payme.io/api/get-sales actually returns
 * ──────────────────────────────────────────────────────────────────────
 *
 * Production logs confirmed PayMe's /get-sales for our seller returns:
 *
 *   {
 *     "status_code": 0,
 *     "items_count": 1,
 *     "items": [
 *       {
 *         "sale_payme_code": "...",     ← note: sale_payme_code, NOT payme_sale_code
 *         "sale_status": "captured",
 *         "sale_price": 5000,
 *         "seller_payme_id": "MPL17762-...",
 *         ...
 *       }
 *     ]
 *   }
 *
 * Our parser previously expected `body.sales` + `payme_sale_code` and
 * silently fell off the empty path. The current implementation reads
 * `body.items` first (fallback to `body.sales` for backwards-compat),
 * and matches on either `sale_payme_code` OR `payme_sale_code`.
 *
 * Docs: https://docs.payme.io
 */

// ── HARDCODED production constants ──
// DO NOT replace these with process.env reads.
// The whole point of this refactor is to make the verification path
// invariant to environment-variable misconfiguration.
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
 * `sale_code` / `sale_id` / `sale_payme_code`), but they all carry the
 * same value, so the caller should pass whichever one they have.
 *
 * Defensive: we send BOTH `payme_sale_code` AND `payme_sale_id` in the
 * request body because PayMe's docs disagree on which one /get-sales
 * filters on. We also handle the response in either array format.
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

  console.log("[payme-verify] verifyPaymeSale:response", {
    httpStatus: response.status,
    statusCode: body.status_code ?? body.statusCode,
    itemsCount: (body.items_count as number | undefined) ?? "n/a",
    itemsLen: Array.isArray(body.items) ? body.items.length : "n/a",
    salesLen: Array.isArray(body.sales) ? body.sales.length : "n/a",
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

  // Find the sale that matches the saleCode the caller asked about.
  // PayMe's response array is `items` on production; the older docs
  // also show `sales`. Match by either `sale_payme_code` (live shape)
  // or `payme_sale_code` (older / docs shape).
  const sale = findMatchingSale(body, saleCode);
  if (!sale) {
    console.error("[payme-verify] verifyPaymeSale:no_matching_sale", {
      saleCodePreview: saleCode.slice(0, 8) + "…",
      bodyShape: {
        itemsCount: body.items_count,
        itemsLen: Array.isArray(body.items) ? body.items.length : "n/a",
        salesLen: Array.isArray(body.sales) ? body.sales.length : "n/a",
        hasSale: !!body.sale,
        topLevelKeys: Object.keys(body).slice(0, 12),
      },
    });
    // 200 OK with no matching sale = forged IPN OR PayMe-side lag.
    // Treat as not_successful (permanent reject) so the webhook
    // returns 401 instead of 500.
    return {
      ok: false,
      reason: "not_successful",
      detail: "PayMe live returned 200 OK but no matching sale (forged IPN or PayMe-side lag)",
    };
  }

  // Pull fields with both modern + legacy names so a future shape
  // change on PayMe's side doesn't silently break us.
  const matchedSaleCode = String(
    sale.sale_payme_code ?? sale.payme_sale_code ?? sale.sale_code ?? saleCode,
  );
  const saleStatus = String(
    sale.sale_status ?? sale.payme_status ?? sale.status ?? "",
  ).toLowerCase();
  const salePriceAgurot = Number(sale.sale_price ?? sale.price ?? 0);
  const saleSellerUid = String(
    sale.seller_payme_id ?? sale.seller_uid ?? "",
  );

  console.log("[payme-verify] verifyPaymeSale:sale", {
    matchedSaleCodePreview: matchedSaleCode.slice(0, 8) + "…",
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
  return {
    ok: true,
    saleCode: matchedSaleCode,
    saleStatus,
    salePriceAgurot,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the sale in PayMe's response that matches the saleCode the
 * caller asked about.
 *
 * Response-shape priority:
 *   1. body.items[]   — the production live.payme.io shape
 *   2. body.sales[]   — older / docs shape (kept for safety)
 *   3. body.sale      — single-sale shape (very old)
 *   4. body itself    — flattened shape (rare but documented)
 *
 * Within each item, we match against ANY of these field names — and
 * cast to string on both sides because PayMe sometimes returns ids as
 * numbers and sometimes as strings:
 *   - sale_payme_code   (current live shape)
 *   - payme_sale_code   (older shape)
 *   - sale_code         (alternative)
 *   - payme_sale_id / sale_id (rare)
 *
 * Returns the first match, or null.
 */
function findMatchingSale(
  body: Record<string, unknown>,
  saleCode: string,
): Record<string, unknown> | null {
  const target = String(saleCode);

  const itemMatches = (item: Record<string, unknown>): boolean => {
    const candidates = [
      item.sale_payme_code,
      item.payme_sale_code,
      item.sale_code,
      item.payme_sale_id,
      item.sale_id,
    ];
    return candidates.some(
      (c) => c !== undefined && c !== null && String(c) === target,
    );
  };

  // 1. items[] — production live shape
  if (Array.isArray(body.items) && body.items.length > 0) {
    for (const it of body.items) {
      if (it && typeof it === "object") {
        const obj = it as Record<string, unknown>;
        if (itemMatches(obj)) return obj;
      }
    }
    // No exact match in items[] — return null rather than picking the
    // first arbitrary item. Picking arbitrarily would let a different
    // sale's status mark our payment COMPLETED.
  }

  // 2. sales[] — older shape (kept for forward/backward compatibility)
  if (Array.isArray(body.sales) && body.sales.length > 0) {
    for (const it of body.sales) {
      if (it && typeof it === "object") {
        const obj = it as Record<string, unknown>;
        if (itemMatches(obj)) return obj;
      }
    }
  }

  // 3. body.sale — single object
  if (body.sale && typeof body.sale === "object") {
    const obj = body.sale as Record<string, unknown>;
    if (itemMatches(obj)) return obj;
  }

  // 4. flattened shape — sale fields directly on body
  if (
    body.sale_payme_code ||
    body.payme_sale_code ||
    body.sale_code ||
    body.sale_status ||
    body.sale_price
  ) {
    if (itemMatches(body)) return body;
  }

  return null;
}
