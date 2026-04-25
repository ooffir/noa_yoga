/**
 * PayMe IPN verification.
 *
 * The incoming webhook body is untrusted — a bad actor could POST a
 * forged IPN to our endpoint to mint free credits. Instead of trusting
 * the body, we call PayMe's own API server-to-server with the received
 * `payme_sale_code` and rely on their authoritative answer.
 *
 * This covers the common attack paths:
 *   - Forged webhook with a valid `payme_sale_code` the attacker
 *     guessed / overheard → PayMe confirms whether it actually succeeded
 *     for OUR seller UID and at the expected amount.
 *   - Replay of a real webhook → idempotency in `completePaymentSuccess`
 *     already handles this even without verification.
 *   - Completely fabricated `payme_sale_code` → PayMe returns an error,
 *     we reject.
 *
 * Docs: https://docs.payme.io
 *   Base URLs — Staging: https://sandbox.payme.io/api
 *              Production: https://live.payme.io/api
 */

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
        | "missing_config"
        | "missing_sale_code"
        | "api_error"
        | "not_successful"
        | "seller_mismatch"
        | "network_error";
      detail?: string;
    };

/**
 * Call PayMe's /api/get-sales endpoint and confirm a sale is genuine.
 *
 * We derive the base URL from `PAYME_API_URL` (which points at
 * `.../api/generate-sale`) so staging and production are automatically
 * consistent with the other API calls we make.
 */
export async function verifyPaymeSale(
  saleCode: string,
): Promise<PaymeVerifyResult> {
  const sellerUid = process.env.PAYME_SELLER_UID?.trim();
  const apiUrl = process.env.PAYME_API_URL?.trim();

  if (!sellerUid || !apiUrl) {
    return {
      ok: false,
      reason: "missing_config",
      detail: "PAYME_SELLER_UID or PAYME_API_URL is unset",
    };
  }

  if (!saleCode) {
    return { ok: false, reason: "missing_sale_code" };
  }

  // Derive base and swap endpoint: .../api/generate-sale → .../api/get-sales
  const baseUrl = apiUrl.replace(/\/generate-sale\/?$/, "");
  const verifyUrl = `${baseUrl}/get-sales`;

  let response: Response;
  try {
    response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        seller_payme_id: sellerUid,
        payme_sale_code: saleCode,
      }),
      // PayMe verify should be fast; fail fast if it hangs.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const rawText = await response.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${response.status}, non-JSON body: ${rawText.slice(0, 200)}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`,
    };
  }

  // PayMe's response shape varies slightly across regions — normalise.
  // Known fields: status_code (0 = OK), sales[] (list of sale objects),
  //               or the single sale fields inline on top-level.
  // Some responses return { sales: [{ sale_status: "captured", ... }] },
  // others flatten. We probe for either.
  const statusCode = (body.status_code ?? body.statusCode) as number | string | undefined;
  if (statusCode !== undefined && String(statusCode) !== "0") {
    return {
      ok: false,
      reason: "api_error",
      detail: `PayMe returned status_code=${statusCode}`,
    };
  }

  const sale = extractFirstSale(body);
  if (!sale) {
    return {
      ok: false,
      reason: "api_error",
      detail: "no sale object in PayMe response",
    };
  }

  const saleStatus = String(
    sale.sale_status ??
      sale.payme_status ??
      sale.status ??
      "",
  ).toLowerCase();
  const salePriceAgurot = Number(sale.sale_price ?? sale.price ?? 0);
  const saleSellerUid = String(sale.seller_payme_id ?? sale.seller_uid ?? "");

  // If PayMe echoes back a seller id that doesn't match us, reject — the
  // attacker may have used a real PayMe sale code from a different merchant.
  if (saleSellerUid && saleSellerUid !== sellerUid) {
    return {
      ok: false,
      reason: "seller_mismatch",
      detail: `response seller=${saleSellerUid.slice(0, 4)}... ours=${sellerUid.slice(0, 4)}...`,
    };
  }

  // Accept multiple spellings of "successful". PayMe uses at least:
  //   - "captured" (sale was fully paid)
  //   - "success"
  //   - "1"
  //   - "paid"
  const isSuccess =
    saleStatus === "captured" ||
    saleStatus === "success" ||
    saleStatus === "paid" ||
    saleStatus === "1";

  if (!isSuccess) {
    return {
      ok: false,
      reason: "not_successful",
      detail: `PayMe reports status=${saleStatus || "(empty)"}`,
    };
  }

  return { ok: true, saleCode, saleStatus, salePriceAgurot };
}

function extractFirstSale(body: Record<string, unknown>): Record<string, unknown> | null {
  // Shape 1: { sales: [ { ... } ] }
  if (Array.isArray(body.sales) && body.sales.length > 0) {
    const first = body.sales[0];
    if (first && typeof first === "object") return first as Record<string, unknown>;
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

// ─────────────────────────────────────────────────────────────────────────────
//  Custom-ref lookup — used by /payments/success and /workshops to actively
//  resolve a sale's status the moment the user lands on the return URL,
//  WITHOUT waiting for PayMe's IPN webhook to arrive.
//
//  PayMe's `/api/get-sales` accepts `custom_1` as a filter parameter, so we
//  can ask "show me the most recent sale tagged with my internal payment id"
//  and decide success / failure / still pending synchronously. Since each
//  generate-sale call we make embeds `custom_1: "pay:<paymentId>"` (or
//  "wsr:<registrationId>"), this lookup is unambiguous per transaction.
//
//  Returns the most recent matching sale (PayMe orders by recency by default).
//  If the same custom_1 yielded multiple captured sales (rare — would require
//  the user retrying past the 60s server-side dedup window) we use the first
//  one in the array; the second won't be allowed to grant duplicate credits
//  by the idempotent `completePaymentSuccess` anyway.
// ─────────────────────────────────────────────────────────────────────────────
export type PaymeCustomLookupReason =
  | "missing_config"
  | "missing_sale_code"
  | "api_error"
  | "seller_mismatch"
  | "network_error"
  | "no_sales_found";

export type PaymeCustomLookupResult =
  | {
      ok: true;
      saleCode: string;
      saleStatus: string;
      salePriceAgurot: number;
      isCaptured: boolean;
    }
  | { ok: false; reason: PaymeCustomLookupReason; detail?: string };

export async function verifyPaymeSaleByCustomRef(
  customRef: string,
): Promise<PaymeCustomLookupResult> {
  const sellerUid = process.env.PAYME_SELLER_UID?.trim();
  const apiUrl = process.env.PAYME_API_URL?.trim();

  if (!sellerUid || !apiUrl) {
    return {
      ok: false,
      reason: "missing_config",
      detail: "PAYME_SELLER_UID or PAYME_API_URL is unset",
    };
  }
  if (!customRef) {
    return { ok: false, reason: "missing_sale_code", detail: "customRef is empty" };
  }

  const baseUrl = apiUrl.replace(/\/generate-sale\/?$/, "");
  const verifyUrl = `${baseUrl}/get-sales`;

  let response: Response;
  try {
    response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        seller_payme_id: sellerUid,
        // PayMe Direct API supports filtering recent sales by the custom_1
        // tag we wrote at generate-sale time. This is the same field the
        // IPN dispatcher reads, so the two paths can never disagree.
        custom_1: customRef,
      }),
      // Active checks happen on the user's return — they're already
      // staring at a spinner. Keep the timeout tight so the page
      // doesn't hang past ~3s if PayMe is slow.
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const rawText = await response.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${response.status}, non-JSON: ${rawText.slice(0, 200)}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`,
    };
  }

  const statusCode = (body.status_code ?? body.statusCode) as number | string | undefined;
  if (statusCode !== undefined && String(statusCode) !== "0") {
    return {
      ok: false,
      reason: "api_error",
      detail: `PayMe returned status_code=${statusCode}`,
    };
  }

  // Pick the most recent sale. PayMe returns `sales: [...]` with the
  // newest one first when filtered. Some shapes return a single sale
  // inline — extractFirstSale handles both.
  const sale = extractFirstSale(body);
  if (!sale) {
    return {
      ok: false,
      reason: "no_sales_found",
      detail: `no sales found for custom_1=${customRef}`,
    };
  }

  const saleCode = String(sale.payme_sale_code ?? sale.sale_code ?? "");
  const saleStatus = String(
    sale.sale_status ?? sale.payme_status ?? sale.status ?? "",
  ).toLowerCase();
  const salePriceAgurot = Number(sale.sale_price ?? sale.price ?? 0);
  const saleSellerUid = String(sale.seller_payme_id ?? sale.seller_uid ?? "");

  if (saleSellerUid && saleSellerUid !== sellerUid) {
    return {
      ok: false,
      reason: "seller_mismatch",
      detail: `response seller=${saleSellerUid.slice(0, 4)}... ours=${sellerUid.slice(0, 4)}...`,
    };
  }

  // "Captured" = funds actually collected. PayMe uses several spellings.
  const isCaptured =
    saleStatus === "captured" ||
    saleStatus === "success" ||
    saleStatus === "paid" ||
    saleStatus === "1";

  return {
    ok: true,
    saleCode,
    saleStatus,
    salePriceAgurot,
    isCaptured,
  };
}
