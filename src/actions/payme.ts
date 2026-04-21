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

  if (!sellerUid || !apiUrl || !siteUrl) {
    console.error("[payme] missing env vars:", {
      PAYME_SELLER_UID: sellerUid ? "set" : "MISSING",
      PAYME_API_URL: apiUrl ? "set" : "MISSING",
      NEXT_PUBLIC_SITE_URL: siteUrl ? "set" : "MISSING",
    });
    return { ok: false, error: "תצורת תשלום חסרה. אנא פנו למנהל." };
  }

  // PayMe expects the price in agurot (ILS cents).
  const salePriceAgurot = Math.round(input.amountIls * 100);

  const body = {
    seller_uid: sellerUid,
    sale_price: salePriceAgurot,
    currency: "ILS",
    product_name: input.productName,
    sale_return_url: `${siteUrl}${input.returnPath}`,
    sale_callback_url: `${siteUrl}/api/webhooks/payme`,
    sale_back_url: `${siteUrl}${input.cancelPath}`,
    sale_customer_fields: {
      email: input.userEmail ?? undefined,
      name: input.userName ?? undefined,
    },
    custom_1: input.customRef,
    custom_2: input.userId,
    custom_3: input.extraCustom,
  };

  console.log("[payme-debug] request:", {
    apiUrl,
    sellerUidMasked: sellerUid.slice(0, 4) + "…" + sellerUid.slice(-2),
    sale_price: salePriceAgurot,
    product_name: input.productName,
    sale_callback_url: body.sale_callback_url,
    sale_return_url: body.sale_return_url,
    custom_1: input.customRef,
  });

  let paymeResponse: PaymeGenerateSaleResponse;
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    console.log("[payme-debug] full response:", { httpStatus: res.status, body: text });

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
        error:
          paymeResponse.status_error_details ||
          `PayMe החזיר שגיאה (HTTP ${res.status})`,
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
      error:
        paymeResponse.status_error_details ||
        `PayMe error ${paymeResponse.status_error_code}`,
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

  const existing = await db.workshopRegistration.findUnique({
    where: { userId_workshopId: { userId: user.id, workshopId } },
  });
  if (existing && existing.paymentStatus === "COMPLETED") {
    return { ok: false, error: "כבר נרשמת לסדנה זו" };
  }

  if (workshop.maxCapacity) {
    const count = await db.workshopRegistration.count({
      where: { workshopId, paymentStatus: { not: "CANCELLED" } },
    });
    const effectiveCount =
      existing && existing.paymentStatus === "PENDING" ? count : count + 1;
    if (effectiveCount > workshop.maxCapacity) {
      return { ok: false, error: "הסדנה מלאה" };
    }
  }

  const registration = existing
    ? await db.workshopRegistration.update({
        where: { id: existing.id },
        data: { paymentStatus: "PENDING" },
      })
    : await db.workshopRegistration.create({
        data: { userId: user.id, workshopId, paymentStatus: "PENDING" },
      });

  return callGenerateSale({
    amountIls: workshop.price,
    productName: workshop.title,
    customRef: `wsr:${registration.id}`,
    userId: user.id,
    extraCustom: workshop.id,
    userEmail: user.email,
    userName: user.name,
    returnPath: `/workshops?success=true&registration=${registration.id}`,
    cancelPath: "/workshops?cancelled=true",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Credit / punch-card purchase
// ─────────────────────────────────────────────────────────────────────────────

export type CreditPurchaseType = "SINGLE_CLASS" | "PUNCH_CARD";

export async function generatePaymeSaleForCredits(
  type: CreditPurchaseType,
): Promise<PaymeSaleResult> {
  if (type !== "SINGLE_CLASS" && type !== "PUNCH_CARD") {
    return { ok: false, error: "סוג רכישה לא תקין" };
  }

  const user = await getDbUser();
  if (!user) {
    return { ok: false, error: "יש להתחבר כדי לרכוש" };
  }

  // Dynamic prices from admin settings — fallback to sane defaults.
  let creditPrice = 50;
  let punchCardPrice = 350;
  try {
    const settings = await db.siteSettings.findUnique({
      where: { id: "main" },
      select: { creditPrice: true, punchCardPrice: true },
    });
    if (settings) {
      creditPrice = settings.creditPrice;
      punchCardPrice = settings.punchCardPrice;
    }
  } catch (err) {
    console.error("[payme-credits] failed to read settings:", err);
  }

  const amountIls = type === "PUNCH_CARD" ? punchCardPrice : creditPrice;
  const productName =
    type === "PUNCH_CARD" ? "כרטיסיית 10 שיעורים" : "שיעור בודד";

  // Create a PENDING payment row so we can correlate the IPN.
  const payment = await db.payment.create({
    data: {
      userId: user.id,
      type,
      // amount is stored in agurot for consistency with our existing schema.
      amount: amountIls * 100,
      status: "PENDING",
    },
  });

  return callGenerateSale({
    amountIls,
    productName,
    customRef: `pay:${payment.id}`,
    userId: user.id,
    extraCustom: type,
    userEmail: user.email,
    userName: user.name,
    returnPath: `/payments/success?payment=${payment.id}`,
    cancelPath: "/pricing?cancelled=true",
  });
}
