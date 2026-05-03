"use server";

import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";
import {
  productLabelFor,
  type CreditPurchaseType,
} from "@/lib/product-catalog";
import { isProfileComplete } from "@/lib/profile-validation";

/**
 * PayMe REST integration — Hosted Payment Page (generate-sale).
 *
 * Production-stable refactor (April 2026):
 *
 *   1. Endpoint and seller UID are PRODUCTION constants. Env vars override
 *      them only if you need to switch back to sandbox for testing.
 *   2. We pass `sale_payment_method: "multi"` so credit card + Apple Pay +
 *      Google Pay + Bit are all eligible (subject to seller-account toggles).
 *   3. We map our internal DB id (Payment.id or WorkshopRegistration.id)
 *      directly into PayMe's `transaction_id` field. PayMe echoes
 *      `transaction_id` back in the IPN — that's the ONLY identifier we
 *      use to dispatch incoming webhooks. No more `custom_1` games.
 *
 * Docs: https://docs.payme.io/docs/payments/86407fa137745-hosted-payment-page
 */

// ── Production constants (PayMe live environment for Noa Yogis) ──
//
// Hardcoded as defaults so a misconfigured env doesn't silently pull
// us into sandbox. Override via env vars only for explicit testing.
const PRODUCTION_API_URL =
  "https://live.payme.io/api/generate-sale";
const PRODUCTION_SELLER_UID =
  "MPL17762-59691SAB-JV1YBNMN-ELCH62AX";

const PAYME_API_URL =
  process.env.PAYME_API_URL?.trim() || PRODUCTION_API_URL;
const PAYME_SELLER_UID =
  process.env.PAYME_SELLER_UID?.trim() || PRODUCTION_SELLER_UID;

// PayMe spec: transaction_id must be a string, max 50 chars.
const PAYME_TXN_ID_MAX = 50;

// ─────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────

export type PaymeSaleResult =
  | { ok: true; url: string }
  | { ok: false; error: string; requiresProfile?: boolean };

interface PaymeGenerateSaleResponse {
  status_code?: number;
  status_error_code?: number;
  status_error_details?: string;
  sale_url?: string;
  payme_sale_code?: string;
}

interface CallGenerateSaleInput {
  /** Price the buyer sees, in ILS (we convert to agurot here). */
  amountIls: number;
  /** Display name on the PayMe checkout page. */
  productName: string;
  /**
   * Our internal DB primary key (Payment.id or WorkshopRegistration.id).
   * PayMe will echo this back in the IPN, allowing reliable dispatch.
   * Must be ≤ 50 chars (PayMe spec); UUIDs (36 chars) fit comfortably.
   */
  transactionId: string;
  userEmail?: string | null;
  userName?: string | null;
  /** Browser redirect after successful payment. */
  returnPath: string;
  /** Browser redirect if the buyer cancels on PayMe's page. */
  cancelPath: string;
}

// ─────────────────────────────────────────────────────────────────────
//  Shared helper — calls PayMe `/api/generate-sale`
// ─────────────────────────────────────────────────────────────────────
async function callGenerateSale(
  input: CallGenerateSaleInput,
): Promise<PaymeSaleResult> {
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const siteUrl = rawSiteUrl.trim().replace(/\/+$/, "");

  if (!siteUrl) {
    console.error("[payme/generate-sale] missing NEXT_PUBLIC_SITE_URL");
    return { ok: false, error: "תצורת השרת חסרה (SITE_URL)" };
  }

  if (input.transactionId.length > PAYME_TXN_ID_MAX) {
    console.error("[payme/generate-sale] transaction_id too long", {
      length: input.transactionId.length,
    });
    return {
      ok: false,
      error: `transaction_id exceeds ${PAYME_TXN_ID_MAX} chars`,
    };
  }

  // PayMe expects price in agurot (ILS cents). Round to integer cents.
  const salePriceAgurot = Math.round(input.amountIls * 100);

  const body = {
    seller_payme_id: PAYME_SELLER_UID,
    sale_price: salePriceAgurot,
    currency: "ILS",
    product_name: input.productName,
    sale_payment_method: "multi",
    sale_return_url: `${siteUrl}${input.returnPath}`,
    sale_callback_url: `${siteUrl}/api/webhooks/payme`,
    sale_back_url: `${siteUrl}${input.cancelPath}`,
    transaction_id: input.transactionId,
    ...(input.userEmail ? { buyer_email: input.userEmail } : {}),
    ...(input.userName ? { buyer_name: input.userName } : {}),
  };

  console.log("[payme/generate-sale] request", {
    apiUrl: PAYME_API_URL,
    sellerUidPrefix: PAYME_SELLER_UID.slice(0, 8) + "…",
    transactionId: input.transactionId,
    amountAgurot: salePriceAgurot,
    productName: input.productName,
    sale_callback_url: body.sale_callback_url,
    sale_return_url: body.sale_return_url,
  });

  let response: Response;
  try {
    response = await fetch(PAYME_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[payme/generate-sale] fetch failed:", msg);
    return { ok: false, error: `לא ניתן להתחבר לספק התשלום: ${msg}` };
  }

  const rawText = await response.text();
  let parsed: PaymeGenerateSaleResponse;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("[payme/generate-sale] non-JSON response", {
      httpStatus: response.status,
      bodyPreview: rawText.slice(0, 300),
    });
    return {
      ok: false,
      error: `PayMe החזיר תגובה לא תקינה (HTTP ${response.status})`,
    };
  }

  if (!response.ok) {
    console.error("[payme/generate-sale] HTTP error", {
      httpStatus: response.status,
      parsed,
    });
    return {
      ok: false,
      error:
        parsed.status_error_details ||
        `PayMe החזיר שגיאה (HTTP ${response.status})`,
    };
  }

  if (parsed.status_code !== 0 && parsed.status_error_code) {
    console.error("[payme/generate-sale] sale failed", parsed);
    return {
      ok: false,
      error:
        parsed.status_error_details ||
        `PayMe error ${parsed.status_error_code}`,
    };
  }

  if (!parsed.sale_url) {
    console.error("[payme/generate-sale] no sale_url in response", parsed);
    return {
      ok: false,
      error:
        parsed.status_error_details || "PayMe לא החזיר קישור לדף תשלום",
    };
  }

  console.log("[payme/generate-sale] OK", {
    transactionId: input.transactionId,
    saleUrlPreview: parsed.sale_url.slice(0, 60) + "…",
  });

  return { ok: true, url: parsed.sale_url };
}

// ─────────────────────────────────────────────────────────────────────
//  Workshop registration
// ─────────────────────────────────────────────────────────────────────

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

  if (!isProfileComplete(user)) {
    return {
      ok: false,
      error: "יש להשלים את פרטי הפרופיל (שם וטלפון) לפני הרשמה לסדנה",
      requiresProfile: true,
    };
  }

  const workshop = await db.workshop.findUnique({ where: { id: workshopId } });
  if (!workshop || !workshop.isActive) {
    return { ok: false, error: "הסדנה לא נמצאה" };
  }
  if (workshop.date < new Date()) {
    return { ok: false, error: "הסדנה כבר התקיימה" };
  }

  // Atomic capacity check + registration upsert (Serializable so two
  // simultaneous "register" clicks for the last seat can't both succeed).
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
          const userCountsAsNewSeat = !(
            existing && existing.paymentStatus === "PENDING"
          );
          if (count + (userCountsAsNewSeat ? 1 : 0) > workshop.maxCapacity) {
            return { kind: "full" as const };
          }
        }

        const registration = await tx.workshopRegistration.upsert({
          where: { userId_workshopId: { userId: user.id, workshopId } },
          create: { userId: user.id, workshopId, paymentStatus: "PENDING" },
          update: { paymentStatus: "PENDING" },
        });
        return {
          kind: "ok" as const,
          registrationId: registration.id,
        };
      },
      { isolationLevel: "Serializable", timeout: 10_000 },
    );
  } catch (err) {
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
    transactionId: registrationId, // ← same id we'll receive in the IPN
    userEmail: user.email,
    userName: user.name,
    returnPath: `/workshops?success=true&registration=${registrationId}`,
    cancelPath: "/workshops?cancelled=true",
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Credit / punch-card purchase
// ─────────────────────────────────────────────────────────────────────

export type { CreditPurchaseType } from "@/lib/product-catalog";

const VALID_CREDIT_TYPES: CreditPurchaseType[] = [
  "SINGLE_CLASS",
  "PUNCH_CARD_5",
  "PUNCH_CARD",
];

/**
 * @param type                 SINGLE_CLASS | PUNCH_CARD_5 | PUNCH_CARD
 * @param bookClassInstanceId  Optional — if provided, /payments/success
 *                             auto-books the user into this class instance
 *                             after the IPN confirms the payment.
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

  if (!isProfileComplete(user)) {
    return {
      ok: false,
      error: "יש להשלים את פרטי הפרופיל (שם וטלפון) לפני רכישה",
      requiresProfile: true,
    };
  }

  // Pricing from admin settings; fall back to sane defaults on error.
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

  // ─── Server-side dedup ───
  // If the same user started a PENDING payment for the same product
  // within the last 60s, reuse that row (eliminates rapid double-clicks
  // creating duplicate Payment rows). Otherwise create a new one.
  const recentPending = await db.payment.findFirst({
    where: {
      userId: user.id,
      type,
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    orderBy: { createdAt: "desc" },
  });

  // ─── Persist BEFORE calling PayMe ───
  // The Payment row must exist with PENDING status before we generate
  // the sale, because the IPN can race the redirect and find the row
  // by transaction_id (= Payment.id).
  const payment =
    recentPending ??
    (await db.payment.create({
      data: {
        userId: user.id,
        type,
        amount: amountIls * 100, // agurot
        status: "PENDING",
      },
    }));

  const returnPath = bookClassInstanceId
    ? `/payments/success?payment=${payment.id}&book=${bookClassInstanceId}`
    : `/payments/success?payment=${payment.id}`;

  return callGenerateSale({
    amountIls,
    productName,
    transactionId: payment.id, // ← exact Payment.id; the IPN will echo this
    userEmail: user.email,
    userName: user.name,
    returnPath,
    cancelPath: "/pricing?cancelled=true",
  });
}
