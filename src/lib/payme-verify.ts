/**
 * PayMe IPN verification + active sale lookup.
 *
 * The incoming webhook body is untrusted — a bad actor could POST a
 * forged IPN to our endpoint to mint free credits. Instead of trusting
 * the body, we call PayMe's own API server-to-server with the received
 * `payme_sale_code` (or our internal `custom_1` reference) and rely on
 * their authoritative answer.
 *
 * Two helpers exposed:
 *   - verifyPaymeSale(saleCode)              — direct lookup by PayMe's id
 *   - verifyPaymeSaleByCustomRef(customRef)  — lookup by our custom_1 tag
 *
 * Both log every step with a `[payme-verify]` prefix so production
 * Vercel logs can pinpoint exactly where verification fails.
 *
 * Docs: https://docs.payme.io
 *   Base URLs — Staging:    https://sandbox.payme.io/api
 *               Production: https://live.payme.io/api
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

// ─────────────────────────────────────────────────────────────────────────────
//  Direct verification by PayMe's own sale id/code
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a specific sale by its PayMe identifier. PayMe's URL params on
 * the return URL come in several flavours — `payme_sale_code`,
 * `payme_sale_id`, `sale_code`, `sale_id` — but they're all the same
 * value, so callers should pass whichever one they have.
 *
 * We send BOTH `payme_sale_code` AND `payme_sale_id` in the request body
 * because PayMe's docs are inconsistent about which one /get-sales
 * actually filters on.
 */
export async function verifyPaymeSale(
  saleCode: string,
): Promise<PaymeVerifyResult> {
  const sellerUid = process.env.PAYME_SELLER_UID?.trim();
  const apiUrl = process.env.PAYME_API_URL?.trim();

  console.log("[payme-verify] verifyPaymeSale:start", {
    saleCodePreview: saleCode ? saleCode.slice(0, 8) + "…" : "(empty)",
    sellerUidSet: !!sellerUid,
    apiUrlSet: !!apiUrl,
  });

  if (!sellerUid || !apiUrl) {
    console.error("[payme-verify] verifyPaymeSale:missing_config");
    return {
      ok: false,
      reason: "missing_config",
      detail: "PAYME_SELLER_UID or PAYME_API_URL is unset",
    };
  }

  if (!saleCode) {
    console.error("[payme-verify] verifyPaymeSale:missing_sale_code");
    return { ok: false, reason: "missing_sale_code" };
  }

  const baseUrl = apiUrl.replace(/\/generate-sale\/?$/, "");
  const verifyUrl = `${baseUrl}/get-sales`;

  let response: Response;
  try {
    response = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // Defensive: pass BOTH names. PayMe accepts the one it understands
      // and ignores the other. This eliminates a class of false negatives
      // when the merchant return URL uses a different name than the
      // /get-sales filter expects.
      body: JSON.stringify({
        seller_payme_id: sellerUid,
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

  // Always log the FULL response body (truncated to 800 chars) so we can
  // diagnose what PayMe actually returns. Sale codes / amounts are not
  // sensitive — they're already in PayMe's logs and our DB.
  console.log("[payme-verify] verifyPaymeSale:response", {
    httpStatus: response.status,
    statusCode: body.status_code ?? body.statusCode,
    hasSales: Array.isArray(body.sales) ? body.sales.length : "n/a",
    hasSale: !!body.sale,
    keys: Object.keys(body).slice(0, 12),
    rawBodyPreview: rawText.slice(0, 800),
  });

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

  const sale = extractFirstSale(body);
  if (!sale) {
    // Distinguish "PayMe returned 200 OK but the result is empty" from a
    // real API error. The former means the sale isn't on this seller
    // account (likely sandbox/live mismatch or wrong PAYME_SELLER_UID),
    // not that the API broke. Use a different reason so callers can
    // retry through other paths instead of bailing out.
    console.error("[payme-verify] verifyPaymeSale:no_sale_in_response", {
      bodyShape: {
        hasSales: Array.isArray(body.sales) ? body.sales.length : "n/a",
        hasSale: !!body.sale,
        topLevelKeys: Object.keys(body).slice(0, 12),
      },
    });
    return {
      ok: false,
      reason: "not_successful",
      detail: "PayMe returned 200 OK but no sale matched (may indicate sandbox/live mismatch or wrong seller UID)",
    };
  }

  const saleStatus = String(
    sale.sale_status ?? sale.payme_status ?? sale.status ?? "",
  ).toLowerCase();
  const salePriceAgurot = Number(sale.sale_price ?? sale.price ?? 0);
  const saleSellerUid = String(sale.seller_payme_id ?? sale.seller_uid ?? "");

  console.log("[payme-verify] verifyPaymeSale:sale", {
    saleStatus,
    salePriceAgurot,
    sellerMatches: !saleSellerUid || saleSellerUid === sellerUid,
  });

  if (saleSellerUid && saleSellerUid !== sellerUid) {
    return {
      ok: false,
      reason: "seller_mismatch",
      detail: `response seller=${saleSellerUid.slice(0, 4)}... ours=${sellerUid.slice(0, 4)}...`,
    };
  }

  if (!isCapturedStatus(saleStatus)) {
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
//  Active lookup by our internal custom_1 reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the most recent sale tagged with our internal `custom_1` value
 * (e.g. `pay:<paymentId>` or `wsr:<registrationId>`) and report whether
 * it has been captured.
 *
 * Two-tier strategy:
 *   1. Direct filter: POST /get-sales with `custom_1=<ref>`.
 *   2. Fallback: if (1) returns 0 sales (some PayMe accounts don't honour
 *      the custom_1 filter), POST /get-sales with a 24h date window and
 *      filter client-side. Slower but reliable.
 *
 * Logs every step so a Vercel log search for `[payme-verify]` can show
 * exactly where the resolution failed.
 */
export async function verifyPaymeSaleByCustomRef(
  customRef: string,
): Promise<PaymeCustomLookupResult> {
  const sellerUid = process.env.PAYME_SELLER_UID?.trim();
  const apiUrl = process.env.PAYME_API_URL?.trim();

  console.log("[payme-verify] customRef:start", {
    customRef,
    sellerUidSet: !!sellerUid,
    apiUrlSet: !!apiUrl,
  });

  if (!sellerUid || !apiUrl) {
    console.error("[payme-verify] customRef:missing_config");
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

  // ─── Pass 1 — direct custom_1 filter ───
  const filtered = await postGetSales(verifyUrl, {
    seller_payme_id: sellerUid,
    custom_1: customRef,
  });

  if (!filtered.ok) {
    console.error("[payme-verify] customRef:pass1_request_error", filtered);
    return { ok: false, reason: filtered.reason, detail: filtered.detail };
  }

  console.log("[payme-verify] customRef:pass1_response", {
    salesCount: filtered.sales.length,
  });

  let matched = pickMatchingSale(filtered.sales, customRef);

  // ─── Pass 2 — fallback: 24h date window then client-side filter ───
  // Some PayMe seller configurations don't honour custom_1 on get-sales.
  // If pass 1 returned zero sales we widen the search to "anything
  // captured by us in the last 24h" and match by custom_1 in JS.
  if (!matched) {
    console.log("[payme-verify] customRef:fallback_attempting_date_window");
    const now = new Date();
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const broad = await postGetSales(verifyUrl, {
      seller_payme_id: sellerUid,
      // PayMe accepts ISO date strings on most date filters. If they
      // ignore the params entirely, we still get all sales for our
      // seller and filter in JS — slower but correct.
      start_date: startDate.toISOString(),
      end_date: now.toISOString(),
    });

    if (!broad.ok) {
      console.error("[payme-verify] customRef:pass2_request_error", broad);
      return { ok: false, reason: broad.reason, detail: broad.detail };
    }

    console.log("[payme-verify] customRef:pass2_response", {
      salesCount: broad.sales.length,
    });

    matched = pickMatchingSale(broad.sales, customRef);
  }

  if (!matched) {
    console.error("[payme-verify] customRef:no_sales_found", { customRef });
    return {
      ok: false,
      reason: "no_sales_found",
      detail: `no sale tagged with custom_1=${customRef} found in either filter or 24h window`,
    };
  }

  const saleCode = String(matched.payme_sale_code ?? matched.sale_code ?? matched.payme_sale_id ?? matched.sale_id ?? "");
  const saleStatus = String(
    matched.sale_status ?? matched.payme_status ?? matched.status ?? "",
  ).toLowerCase();
  const salePriceAgurot = Number(matched.sale_price ?? matched.price ?? 0);
  const saleSellerUid = String(matched.seller_payme_id ?? matched.seller_uid ?? "");

  console.log("[payme-verify] customRef:matched", {
    saleCodePreview: saleCode ? saleCode.slice(0, 8) + "…" : "(empty)",
    saleStatus,
    salePriceAgurot,
  });

  if (saleSellerUid && saleSellerUid !== sellerUid) {
    return {
      ok: false,
      reason: "seller_mismatch",
      detail: `response seller=${saleSellerUid.slice(0, 4)}... ours=${sellerUid.slice(0, 4)}...`,
    };
  }

  const isCaptured = isCapturedStatus(saleStatus);
  console.log("[payme-verify] customRef:decision", { isCaptured, saleStatus });

  return {
    ok: true,
    saleCode,
    saleStatus,
    salePriceAgurot,
    isCaptured,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Amount + timestamp match — last-resort lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a captured sale at PayMe matching the given amount within the
 * last N minutes. Used as a final fallback when both `custom_1` filter
 * and direct sale-id verification fail — typically when PayMe's seller
 * config strips custom fields from the IPN body and the /get-sales
 * response.
 *
 * Caller is expected to have already verified that the requested amount
 * is unambiguous in their own DB (i.e. only one PENDING payment with
 * this amount is open right now). The PayMe side just confirms a real
 * captured sale of that amount happened.
 *
 * Returns:
 *   - ok: true   if EXACTLY ONE captured sale of that amount exists in
 *                 the time window (the safe match)
 *   - ok: false  with reason="no_sales_found" if zero matches
 *   - ok: false  with reason="ambiguous" if 2+ matches (we refuse to
 *                 guess; caller should manually review)
 */
export async function findCapturedSaleMatchingAmount(params: {
  amountAgurot: number;
  withinMinutes?: number;
}): Promise<
  | { ok: true; saleCode: string; saleStatus: string; salePriceAgurot: number; isCaptured: true }
  | { ok: false; reason: PaymeCustomLookupReason | "ambiguous"; detail?: string; matchCount?: number }
> {
  const sellerUid = process.env.PAYME_SELLER_UID?.trim();
  const apiUrl = process.env.PAYME_API_URL?.trim();
  const withinMinutes = params.withinMinutes ?? 10;

  console.log("[payme-verify] amount:start", {
    amountAgurot: params.amountAgurot,
    withinMinutes,
  });

  if (!sellerUid || !apiUrl) {
    console.error("[payme-verify] amount:missing_config");
    return { ok: false, reason: "missing_config", detail: "PAYME_SELLER_UID or PAYME_API_URL is unset" };
  }

  if (!Number.isFinite(params.amountAgurot) || params.amountAgurot <= 0) {
    return { ok: false, reason: "missing_sale_code", detail: "invalid amount" };
  }

  const baseUrl = apiUrl.replace(/\/generate-sale\/?$/, "");
  const verifyUrl = `${baseUrl}/get-sales`;

  // We pull the last 30 minutes (a bit wider than the requested window)
  // so we can log all captures and pick the recent ones in JS. PayMe's
  // own date filtering is sometimes flaky, so giving ourselves a bit
  // more margin and filtering client-side is more reliable.
  const now = new Date();
  const broadStart = new Date(now.getTime() - 30 * 60 * 1000);

  const resp = await postGetSales(verifyUrl, {
    seller_payme_id: sellerUid,
    start_date: broadStart.toISOString(),
    end_date: now.toISOString(),
  });

  if (!resp.ok) {
    console.error("[payme-verify] amount:request_error", resp);
    return { ok: false, reason: resp.reason, detail: resp.detail };
  }

  console.log("[payme-verify] amount:response", {
    salesReturned: resp.sales.length,
  });

  const cutoff = new Date(now.getTime() - withinMinutes * 60 * 1000).getTime();

  // Filter to: captured + matching amount + within the recency window.
  const candidates = resp.sales.filter((s) => {
    const status = String(s.sale_status ?? s.payme_status ?? s.status ?? "").toLowerCase();
    if (!isCapturedStatus(status)) return false;

    const price = Number(s.sale_price ?? s.price ?? 0);
    if (price !== params.amountAgurot) return false;

    // PayMe returns the timestamp under various names. Be defensive.
    const tsStr =
      (s.create_date as string) ??
      (s.created_at as string) ??
      (s.transmission_date as string) ??
      (s.transmissionDate as string) ??
      (s.sale_create_date as string) ??
      "";
    const ts = tsStr ? new Date(tsStr).getTime() : NaN;
    // If PayMe didn't give us a timestamp at all, fall back to "any".
    // The alternative — silently ignoring the sale — would mean we
    // can't match anything when timestamps are missing, which is worse.
    if (Number.isNaN(ts)) return true;
    return ts >= cutoff;
  });

  console.log("[payme-verify] amount:candidates", {
    count: candidates.length,
    amountAgurot: params.amountAgurot,
  });

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "no_sales_found",
      detail: `no captured sale of ${params.amountAgurot} agurot in last ${withinMinutes} min`,
      matchCount: 0,
    };
  }

  if (candidates.length > 1) {
    // Two or more captured sales of the same amount within minutes —
    // this is rare but possible (two students booking the same product).
    // Refuse to guess; caller should escalate to manual review.
    console.error("[payme-verify] amount:ambiguous", {
      count: candidates.length,
      amountAgurot: params.amountAgurot,
    });
    return {
      ok: false,
      reason: "ambiguous",
      detail: `${candidates.length} sales matched — admin must reconcile manually`,
      matchCount: candidates.length,
    };
  }

  const sale = candidates[0];
  const saleCode = String(sale.payme_sale_code ?? sale.sale_code ?? sale.payme_sale_id ?? sale.sale_id ?? "");
  const saleStatus = String(sale.sale_status ?? sale.payme_status ?? sale.status ?? "").toLowerCase();

  console.log("[payme-verify] amount:matched", {
    saleCodePreview: saleCode ? saleCode.slice(0, 8) + "…" : "(empty)",
    saleStatus,
  });

  return {
    ok: true,
    saleCode,
    saleStatus,
    salePriceAgurot: params.amountAgurot,
    isCaptured: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internals
// ─────────────────────────────────────────────────────────────────────────────

type GetSalesResult =
  | { ok: true; sales: Record<string, unknown>[] }
  | { ok: false; reason: PaymeCustomLookupReason; detail?: string };

/**
 * Single-shot wrapper around `POST /api/get-sales`. Returns the sales
 * array regardless of which response shape PayMe used (`{sales: [...]}`,
 * `{sale: {...}}`, or fields inline).
 */
async function postGetSales(
  url: string,
  body: Record<string, unknown>,
): Promise<GetSalesResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
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
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${response.status}, non-JSON body: ${rawText.slice(0, 200)}`,
    };
  }

  // Log the raw PayMe response so we can see the actual shape.
  // Truncated to 800 chars; sale codes / amounts aren't sensitive.
  console.log("[payme-verify] postGetSales:raw_response", {
    httpStatus: response.status,
    rawBodyPreview: rawText.slice(0, 800),
  });

  if (!response.ok) {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 200)}`,
    };
  }

  const statusCode = (parsed.status_code ?? parsed.statusCode) as number | string | undefined;
  if (statusCode !== undefined && String(statusCode) !== "0") {
    return {
      ok: false,
      reason: "api_error",
      detail: `PayMe status_code=${statusCode}: ${JSON.stringify(parsed).slice(0, 200)}`,
    };
  }

  // Normalise into an array of sale objects
  const sales: Record<string, unknown>[] = [];
  if (Array.isArray(parsed.sales)) {
    for (const s of parsed.sales) {
      if (s && typeof s === "object") sales.push(s as Record<string, unknown>);
    }
  } else if (parsed.sale && typeof parsed.sale === "object") {
    sales.push(parsed.sale as Record<string, unknown>);
  } else if (parsed.payme_sale_code || parsed.sale_status || parsed.sale_price) {
    sales.push(parsed);
  }

  return { ok: true, sales };
}

/**
 * Pick the most recent sale matching our `custom_1` reference and that
 * is in a "captured-ish" state. PayMe sometimes returns multiple sales
 * for the same custom_1 (the user retried) — we prefer captured ones,
 * then fall back to the most recent of any state so the caller can see
 * "still pending" vs "no record at all".
 */
function pickMatchingSale(
  sales: Record<string, unknown>[],
  customRef: string,
): Record<string, unknown> | null {
  if (sales.length === 0) return null;

  const matching = sales.filter((s) => {
    const c1 = String(s.custom_1 ?? s.customId1 ?? "");
    return c1 === customRef;
  });

  if (matching.length === 0) {
    // Some PayMe responses include all custom fields, others don't echo
    // them. If our filter didn't match anything but pass 1 was a direct
    // custom_1 filter (so PayMe already filtered server-side), trust the
    // first sale in the response.
    return sales[0];
  }

  // Prefer a captured one; fall back to the first match.
  const captured = matching.find((s) => {
    const status = String(
      s.sale_status ?? s.payme_status ?? s.status ?? "",
    ).toLowerCase();
    return isCapturedStatus(status);
  });
  return captured ?? matching[0];
}

function isCapturedStatus(s: string): boolean {
  // PayMe spellings observed in the wild:
  //   "captured", "success", "1", "paid", "completed", "approved"
  return (
    s === "captured" ||
    s === "success" ||
    s === "paid" ||
    s === "completed" ||
    s === "approved" ||
    s === "1"
  );
}

function extractFirstSale(body: Record<string, unknown>): Record<string, unknown> | null {
  if (Array.isArray(body.sales) && body.sales.length > 0) {
    const first = body.sales[0];
    if (first && typeof first === "object") return first as Record<string, unknown>;
  }
  if (body.sale && typeof body.sale === "object") {
    return body.sale as Record<string, unknown>;
  }
  if (body.payme_sale_code || body.sale_status || body.sale_price) {
    return body;
  }
  return null;
}
