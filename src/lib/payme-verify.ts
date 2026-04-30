/**
 * PayMe IPN verification — the single helper used by the webhook to
 * confirm a sale really captured for our seller before crediting.
 *
 * Why this matters:
 *   The webhook body is untrusted — anyone with our /api/webhooks/payme
 *   URL could forge a POST. Instead of trusting the body, we re-check
 *   via PayMe's `/api/get-sales` endpoint with the received
 *   `payme_sale_code`. PayMe responds with the authoritative status,
 *   amount, and seller — letting us reject forgeries.
 *
 * This is one of two webhook authenticity checks. The webhook prefers
 * MD5 signature verification (cheaper, no network round-trip) and only
 * falls back to this server-to-server call if no signature is present.
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

/**
 * Verify a specific sale by its PayMe identifier. PayMe's URL params
 * sometimes use `payme_sale_code`, sometimes `payme_sale_id`, sometimes
 * `sale_code` / `sale_id` — they're the same value, so callers should
 * pass whichever one they have.
 *
 * Defensive: we send BOTH `payme_sale_code` AND `payme_sale_id` in the
 * request body because PayMe's docs are inconsistent about which name
 * /get-sales actually filters on.
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
    hasSales: Array.isArray(body.sales) ? body.sales.length : "n/a",
    hasSale: !!body.sale,
    rawBodyPreview: rawText.slice(0, 600),
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
    console.error("[payme-verify] verifyPaymeSale:no_sale_in_response");
    // 200 OK with empty result = "this seller doesn't have that sale".
    // Could be a sandbox/live mismatch, a wrong PAYME_SELLER_UID, or a
    // forgery attempt. Treat as not-successful (permanent), not api_error
    // (transient). Webhook will reject with 401.
    return {
      ok: false,
      reason: "not_successful",
      detail:
        "PayMe returned 200 OK but no matching sale (check seller UID / environment)",
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
    sellerMatches: !saleSellerUid || saleSellerUid === sellerUid,
  });

  if (saleSellerUid && saleSellerUid !== sellerUid) {
    return {
      ok: false,
      reason: "seller_mismatch",
      detail: `response seller=${saleSellerUid.slice(0, 4)}... ours=${sellerUid.slice(0, 4)}...`,
    };
  }

  // PayMe spellings observed in the wild:
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
