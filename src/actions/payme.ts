"use server";

import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

/**
 * PayMe REST integration — Hosted Payment Page (generate-sale).
 *
 * Docs: https://developers.paymeservice.com/
 *
 * Two sale kinds share this single integration:
 *   - Workshop registration  → custom_1 = "wsr:<registrationId>"
 *   - Credit / punch card    → custom_1 = "pay:<paymentId>"
 *
 * The webhook at /api/webhooks/payme parses the custom_1 prefix to
 * dispatch the correct DB update.
 */

export type PaymeSaleResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

interface PaymeGenerateSaleResponse {
  status_code?: number;
  status_error_code?: number;
  status_error_details?: string;
  sale_url?: string;
  payme_sale_code?: string;
}

interface PaymeSaleInput {
  amountIls: number;
  productName: string;
  customRef: string;
  userId: string;
  extraCustom?: string;
  userEmail?: string | null;
  userName?: string | null;
  returnPath: string;
  cancelPath: string;
}

/**
 * Shared helper: talks to PayMe's /api/generate-sale endpoint.
 */
async function callGenerateSale(input: PaymeSaleInput): Promise<PaymeSaleResult> {
  const sellerUid = process.env.PAYME_SELLER_UID?.trim();
  const apiUrl = process.env.PAYME_API_URL?.trim();
  // Strip trailing slash to prevent "//api/webhooks/payme" callback URLs.
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const siteUrl = rawSiteUrl.trim().replace(/\/+$/, "");

  // TEMP DEBUG: expose *which* variable is missing and what the API URL looks like
  // so we can diagnose misconfig on Vercel. Remove once payments are stable.
  const missing: string[] = [];
  if (!sellerUid) missing.push("PAYME_SELLER_UID");
  if (!apiUrl) missing.push("PAYME_API_URL");
  if (!siteUrl) missing.push("NEXT_PUBLIC_SITE_URL");

  // Even when all three are "present", the URL may be malformed (e.g., a token
  // pasted into PAYME_API_URL). Validate it's actually an http(s) URL.
  const apiUrlLooksValid = !!apiUrl && /^https?:\/\//i.test(apiUrl);
  if (apiUrl && !apiUrlLooksValid) {
    missing.push(`PAYME_API_URL (invalid: "${apiUrl.slice(0, 40)}…")`);
  }

  if (missing.length > 0 || !sellerUid || !apiUrl || !siteUrl) {
    console.error("[payme] env check failed:", {
      PAYME_SELLER_UID: sellerUid ? `set (len=${sellerUid.length})` : "MISSING",
      PAYME_API_URL: apiUrl
        ? `set (${apiUrlLooksValid ? "valid URL" : "INVALID — not http(s)"}: ${apiUrl.slice(0, 60)})`
        : "MISSING",
      NEXT_PUBLIC_SITE_URL: siteUrl ? `set (${siteUrl})` : "MISSING",
    });
    return {
      ok: false,
      error: `[debug] חסרים/לא תקינים: ${missing.join(", ")}`,
    };
  }

  // PayMe expects the price in agurot (ILS cents).
  const salePriceAgurot = Math.round(input.amountIls * 100);

  // Detect which PayMe environment we're hitting (helps diagnose seller-id mismatch).
  // Verified base URLs from payme.stoplight.io Direct API dashboard:
  //   Staging:    https://sandbox.payme.io/api/
  //   Production: https://live.payme.io/api/
  const isSandbox = /sandbox\./i.test(apiUrl);
  const isProduction = /live\./i.test(apiUrl);
  const envLabel = isSandbox ? "SANDBOX" : isProduction ? "PRODUCTION" : "UNKNOWN";

  // PayMe /api/generate-sale required fields:
  //   seller_payme_id, sale_price (in agurot), currency, product_name
  // Docs: https://docs.payme.io/docs/payments/86407fa137745-hosted-payment-page
  const body: Record<string, unknown> = {
    seller_payme_id: sellerUid,
    sale_price: salePriceAgurot,
    currency: "ILS",
    product_name: input.productName,
    sale_return_url: `${siteUrl}${input.returnPath}`,
    sale_callback_url: `${siteUrl}/api/webhooks/payme`,
    sale_back_url: `${siteUrl}${input.cancelPath}`,
    // Buyer info at top-level (PayMe uses snake_case `buyer_*`).
    ...(input.userEmail ? { buyer_email: input.userEmail } : {}),
    ...(input.userName ? { buyer_name: input.userName } : {}),
    custom_1: input.customRef,
    custom_2: input.userId,
    custom_3: input.extraCustom,
  };

  // Verbose outbound logging — dev only. Production logs stay clean; the
  // higher-level `[payme-webhook]` + `[payments]` logs cover the decision
  // points needed for incident response.
  if (process.env.NODE_ENV === "development") {
    console.log("[payme-debug] request:", {
      env: envLabel,
      apiUrl,
      sellerUidMasked: sellerUid.slice(0, 4) + "…" + sellerUid.slice(-2),
      sale_price: salePriceAgurot,
      product_name: input.productName,
      sale_callback_url: body.sale_callback_url,
      sale_return_url: body.sale_return_url,
      custom_1: input.customRef,
    });
  }

  let paymeResponse: PaymeGenerateSaleResponse;
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    if (process.env.NODE_ENV === "development") {
      console.log("[payme-debug] full response:", { httpStatus: res.status, body: text });
    }

    try {
      paymeResponse = JSON.parse(text);
    } catch {
      console.error("[payme] non-JSON response:", res.status, text.slice(0, 300));
      return {
        ok: false,
        error: `PayMe החזיר תגובה לא תקינה (HTTP ${res.status}): ${text.slice(0, 120)}`,
      };
    }

    if (!res.ok) {
      console.error("[payme] HTTP error:", res.status, paymeResponse);
      return {
        ok: false,
        error: `[${envLabel}] ${
          paymeResponse.status_error_details ||
          `PayMe החזיר שגיאה (HTTP ${res.status})`
        }`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[payme] fetch failed:", msg);
    return { ok: false, error: `לא ניתן להתחבר לספק התשלום: ${msg}` };
  }

  if (paymeResponse.status_code !== 0 && paymeResponse.status_error_code) {
    console.error("[payme] sale failed:", paymeResponse);
    return {
      ok: false,
      error: `[${envLabel}] ${
        paymeResponse.status_error_details ||
        `PayMe error ${paymeResponse.status_error_code}`
      }`,
    };
  }

  if (!paymeResponse.sale_url) {
    console.error("[payme] no sale_url in response:", paymeResponse);
    return {
      ok: false,
      error:
        paymeResponse.status_error_details ||
        "PayMe לא החזיר קישור לדף תשלום",
    };
  }

  return { ok: true, url: paymeResponse.sale_url };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Workshop registration
// ─────────────────────────────────────────────────────────────────────────────

export async function generatePaymeSaleForWorkshop(
  workshopId: string,
): Promise<PaymeSaleResult> {
  if (!workshopId || typeof workshopId !== "string") {
    return { ok: false, error: "מזהה סדנה חסר" };
  }

  const user = await getDbUser();
  if (!user) {
    return { ok: false, error: "יש להתחבר כדי להירשם לסדנה" };
  }

  const workshop = await db.workshop.findUnique({ where: { id: workshopId } });
  if (!workshop || !workshop.isActive) {
    return { ok: false, error: "הסדנה לא נמצאה" };
  }
  if (workshop.date < new Date()) {
    return { ok: false, error: "הסדנה כבר התקיימה" };
  }

  // ─── Atomic capacity check + registration upsert ───
  // Must run inside a Serializable transaction so two users clicking
  // "Register" for the last spot at the same time can't both succeed.
  // Mirror of the BookingEngine.bookClass pattern for class seats.
  type RegistrationResult =
    | { kind: "already_completed" }
    | { kind: "full" }
    | { kind: "ok"; registrationId: string };

  let txResult: RegistrationResult;
  try {
    txResult = await db.$transaction(
      async (tx) => {
        const existing = await tx.workshopRegistration.findUnique({
          where: { userId_workshopId: { userId: user.id, workshopId } },
        });
        if (existing && existing.paymentStatus === "COMPLETED") {
          return { kind: "already_completed" as const };
        }

        if (workshop.maxCapacity) {
          const count = await tx.workshopRegistration.count({
            where: { workshopId, paymentStatus: { not: "CANCELLED" } },
          });
          // If the current user already has a PENDING row, it's included
          // in the count — don't double-count them when deciding capacity.
          const userCountsAsNewSeat = !(existing && existing.paymentStatus === "PENDING");
          const effectiveCount = userCountsAsNewSeat ? count + 1 : count;
          if (effectiveCount > workshop.maxCapacity) {
            return { kind: "full" as const };
          }
        }

        // Upsert: the unique (userId, workshopId) index guarantees dedup
        // even under concurrent writes. Resets PENDING status if the user
        // previously attempted and abandoned / cancelled.
        const registration = await tx.workshopRegistration.upsert({
          where: { userId_workshopId: { userId: user.id, workshopId } },
          create: { userId: user.id, workshopId, paymentStatus: "PENDING" },
          update: { paymentStatus: "PENDING" },
        });

        return { kind: "ok" as const, registrationId: registration.id };
      },
      { isolationLevel: "Serializable", timeout: 10_000 },
    );
  } catch (err) {
    // Serializable isolation can throw on write conflicts — translate to
    // a user-friendly "try again" rather than crashing.
    console.error("[payme-workshop] capacity tx error:", err);
    return { ok: false, error: "אירעה שגיאה, נסו שוב" };
  }

  if (txResult.kind === "already_completed") {
    return { ok: false, error: "כבר נרשמת לסדנה זו" };
  }
  if (txResult.kind === "full") {
    return { ok: false, error: "הסדנה מלאה" };
  }

  const registrationId = txResult.registrationId;

  return callGenerateSale({
    amountIls: workshop.price,
    productName: workshop.title,
    customRef: `wsr:${registrationId}`,
    userId: user.id,
    extraCustom: workshop.id,
    userEmail: user.email,
    userName: user.name,
    returnPath: `/workshops?success=true&registration=${registrationId}`,
    cancelPath: "/workshops?cancelled=true",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Credit / punch-card purchase
// ─────────────────────────────────────────────────────────────────────────────

// Re-export from the centralized catalog so old importers continue to work
// via `import { type CreditPurchaseType } from "@/actions/payme"`.
export type { CreditPurchaseType } from "@/lib/product-catalog";

import type { CreditPurchaseType } from "@/lib/product-catalog";
import { productLabelFor } from "@/lib/product-catalog";

const VALID_CREDIT_TYPES: CreditPurchaseType[] = [
  "SINGLE_CLASS",
  "PUNCH_CARD_5",
  "PUNCH_CARD",
];

/**
 * @param type  SINGLE_CLASS (1 credit) | PUNCH_CARD_5 (5 credits) | PUNCH_CARD (10 credits)
 * @param bookClassInstanceId  optional — if provided, after successful
 *                             payment the user will be auto-booked into
 *                             this class instance on /payments/success
 */
export async function generatePaymeSaleForCredits(
  type: CreditPurchaseType,
  bookClassInstanceId?: string,
): Promise<PaymeSaleResult> {
  if (!VALID_CREDIT_TYPES.includes(type)) {
    return { ok: false, error: "סוג רכישה לא תקין" };
  }

  const user = await getDbUser();
  if (!user) {
    return { ok: false, error: "יש להתחבר כדי לרכוש" };
  }

  // Dynamic prices from admin settings — fallback to sane defaults.
  let creditPrice = 50;
  let punchCard5Price = 200;
  let punchCardPrice = 350;
  try {
    const settings = await db.siteSettings.findUnique({
      where: { id: "main" },
      select: {
        creditPrice: true,
        punchCard5Price: true,
        punchCardPrice: true,
      },
    });
    if (settings) {
      creditPrice = settings.creditPrice;
      punchCard5Price = settings.punchCard5Price;
      punchCardPrice = settings.punchCardPrice;
    }
  } catch (err) {
    console.error("[payme-credits] failed to read settings:", err);
  }

  const priceByType: Record<CreditPurchaseType, number> = {
    SINGLE_CLASS: creditPrice,
    PUNCH_CARD_5: punchCard5Price,
    PUNCH_CARD: punchCardPrice,
  };
  const amountIls = priceByType[type];
  const productName = productLabelFor(type);

  // Server-side dedup window: if the same user started a PENDING payment
  // for the same type within the last 60 seconds, reuse that row instead
  // of creating a new one. Together with the client-side useRef guard,
  // this eliminates the "duplicate stuck Payment row" problem that can
  // happen from rapid double-clicks, multi-tab checkout, or bot replay.
  const DEDUP_WINDOW_MS = 60_000;
  const recentPending = await db.payment.findFirst({
    where: {
      userId: user.id,
      type,
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });

  const payment =
    recentPending ??
    (await db.payment.create({
      data: {
        userId: user.id,
        type,
        // amount is stored in agurot for consistency with our existing schema.
        amount: amountIls * 100,
        status: "PENDING",
      },
    }));

  // recentPending reuse is silent in production — no action needed beyond
  // the DB dedup itself. Visible in development via the gated debug block
  // below if a developer needs to confirm the flow.

  // Append optional auto-book class id so /payments/success can register
  // the user into the class after payment completes.
  const returnPath = bookClassInstanceId
    ? `/payments/success?payment=${payment.id}&book=${bookClassInstanceId}`
    : `/payments/success?payment=${payment.id}`;

  return callGenerateSale({
    amountIls,
    productName,
    customRef: `pay:${payment.id}`,
    userId: user.id,
    extraCustom: type,
    userEmail: user.email,
    userName: user.name,
    returnPath,
    cancelPath: "/pricing?cancelled=true",
  });
}
