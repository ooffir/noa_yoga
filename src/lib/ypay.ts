/**
 * Ypay (חשבונית ירוקה / Green Invoice / iCount) automation — receipt generation.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  What this module does
 * ──────────────────────────────────────────────────────────────────────
 *
 * After a payment succeeds in PayMe, we want to automatically issue a
 * tax-compliant receipt (חשבונית מס/קבלה) via Ypay's API. This module
 * is the integration boundary — `generateInvoice(userData)` is called
 * from the success paths in `src/lib/payments.ts`.
 *
 * It's currently a STUB: the function logs the request and returns a
 * "not configured" result if the env vars aren't set, and returns a
 * placeholder success when they are. To activate real Ypay integration:
 *
 *   1. Set environment variables on Vercel:
 *        YPAY_API_BASE_URL="https://api.greeninvoice.co.il/api/v1"
 *          (or whichever Ypay endpoint the studio's account uses)
 *        YPAY_API_TOKEN="<token from Ypay dashboard>"
 *        YPAY_BUSINESS_ID="<business id>"
 *
 *   2. Replace the body of `callYpayApi()` with the real fetch — the
 *      contract (input/output) of `generateInvoice` won't change so
 *      callers don't need updates.
 *
 *   3. Deploy. Every successful payment will trigger receipt generation
 *      transparently. Failures are logged but DO NOT roll back the
 *      payment — the customer's card was charged regardless of whether
 *      the PDF receipt was issued.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  Why fire-and-forget
 * ──────────────────────────────────────────────────────────────────────
 *
 * Ypay can take 1-3 seconds to issue an invoice. We run this as a
 * background side-effect after `completePaymentSuccess` commits,
 * exactly like the email receipt — the customer's "credits granted"
 * UX must NOT block on receipt generation.
 */

export interface YpayInvoiceUserData {
  /** Internal Payment.id or WorkshopRegistration.id — for our records. */
  internalRefId: string;
  /** PayMe's sale code from the IPN — appears on the receipt. */
  paymeSaleCode?: string | null;
  /** Customer name (Hebrew, falls back to email username). */
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  /** Product label as shown on the receipt (e.g. "כרטיסיית 10 שיעורים"). */
  productLabel: string;
  /** Amount in ILS (NOT agurot). */
  amountIls: number;
  /** Optional explicit transaction date; defaults to now. */
  transactionDate?: Date;
}

export type YpayInvoiceResult =
  | { ok: true; invoiceNumber: string; invoiceUrl?: string }
  | { ok: false; reason: string; detail?: string };

/**
 * Issue a tax receipt (קבלה) via Ypay for a successful payment.
 *
 * Always returns a result — never throws. Callers should fire-and-forget
 * with `.catch()` for safety, but this function is designed not to need
 * one. Failure modes:
 *   - `not_configured`: env vars missing → no API call attempted
 *   - `network_error`: fetch failed (timeout / DNS / etc.)
 *   - `api_error`: Ypay returned non-2xx
 */
export async function generateInvoice(
  userData: YpayInvoiceUserData,
): Promise<YpayInvoiceResult> {
  const apiBaseUrl = process.env.YPAY_API_BASE_URL?.trim();
  const apiToken = process.env.YPAY_API_TOKEN?.trim();
  const businessId = process.env.YPAY_BUSINESS_ID?.trim();

  console.log("[ypay] generateInvoice:start", {
    internalRefId: userData.internalRefId,
    customerEmail: userData.customerEmail,
    productLabel: userData.productLabel,
    amountIls: userData.amountIls,
    configured: !!(apiBaseUrl && apiToken && businessId),
  });

  if (!apiBaseUrl || !apiToken || !businessId) {
    console.warn(
      "[ypay] not configured — skipping invoice generation. Set " +
        "YPAY_API_BASE_URL, YPAY_API_TOKEN, YPAY_BUSINESS_ID on Vercel " +
        "to activate.",
    );
    return {
      ok: false,
      reason: "not_configured",
      detail: "YPAY_* env vars not set",
    };
  }

  return callYpayApi({ apiBaseUrl, apiToken, businessId }, userData);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internal — actual API call
// ─────────────────────────────────────────────────────────────────────────────

interface YpayCredentials {
  apiBaseUrl: string;
  apiToken: string;
  businessId: string;
}

/**
 * Real Ypay call. Currently a stub that logs the would-be payload and
 * returns a synthetic success. Replace the marked block when
 * activating real integration.
 *
 * The exact endpoint + payload schema depends on which Ypay product
 * the studio uses (Green Invoice / iCount / Hashavshevet). Confirm
 * with the studio's accountant before enabling.
 */
async function callYpayApi(
  creds: YpayCredentials,
  userData: YpayInvoiceUserData,
): Promise<YpayInvoiceResult> {
  const transactionDate = userData.transactionDate ?? new Date();

  // ─── BEGIN PLACEHOLDER ───────────────────────────────────────────────
  // When activating real Ypay integration, replace everything between
  // BEGIN / END markers with the actual fetch call. See the top-of-file
  // comment for the typical Ypay contract.
  console.log("[ypay] would_send", {
    apiBaseUrl: creds.apiBaseUrl,
    businessId: creds.businessId,
    payload: {
      type: "receipt",
      reference: userData.internalRefId,
      date: transactionDate.toISOString().slice(0, 10),
      client: {
        name: userData.customerName,
        email: userData.customerEmail,
        phone: userData.customerPhone || undefined,
      },
      income: [
        {
          description: userData.productLabel,
          amount: userData.amountIls,
          currency: "ILS",
        },
      ],
      payment: [
        {
          type: "credit_card",
          amount: userData.amountIls,
          currency: "ILS",
          gateway: "PayMe",
          confirmation: userData.paymeSaleCode ?? userData.internalRefId,
        },
      ],
    },
  });

  // Placeholder result. Real implementation should parse Ypay's response.
  return {
    ok: true,
    invoiceNumber: `STUB-${userData.internalRefId.slice(0, 8)}`,
  };
  // ─── END PLACEHOLDER ─────────────────────────────────────────────────

  /*
  // Reference implementation skeleton for when activating:
  
  let response: Response;
  try {
    response = await fetch(`${creds.apiBaseUrl}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.apiToken}`,
      },
      body: JSON.stringify({
        type: 320, // tax invoice receipt — confirm code with Ypay docs
        date: transactionDate.toISOString().slice(0, 10),
        lang: "he",
        currency: "ILS",
        description: userData.productLabel,
        client: {
          name: userData.customerName,
          emails: [userData.customerEmail],
          phone: userData.customerPhone || undefined,
        },
        income: [
          {
            description: userData.productLabel,
            quantity: 1,
            price: userData.amountIls,
            currency: "ILS",
            vatType: 1,
          },
        ],
        payment: [
          {
            type: 3, // credit card — confirm code with Ypay docs
            price: userData.amountIls,
            currency: "ILS",
          },
        ],
        remarks: `PayMe sale: ${userData.paymeSaleCode ?? userData.internalRefId}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${response.status}: ${JSON.stringify(json).slice(0, 200)}`,
    };
  }

  return {
    ok: true,
    invoiceNumber: String(json.documentNumber ?? json.id ?? "unknown"),
    invoiceUrl: json.url || json.documentUrl || undefined,
  };
  */
}
