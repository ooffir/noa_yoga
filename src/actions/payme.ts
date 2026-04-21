"use server";

import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

/**
 * PayMe REST integration — Hosted Payment Page (generate-sale).
 *
 * Docs: https://developers.paymeservice.com/
 *
 * Flow:
 *   1. User clicks "Register & Pay" on a workshop.
 *   2. This server action is invoked.
 *   3. We authenticate via Clerk, load the workshop, create a PENDING
 *      WorkshopRegistration row so we have a stable ID to correlate.
 *   4. We POST to PayMe's /api/generate-sale, passing the registrationId
 *      as `custom_1` (round-trips back in the IPN).
 *   5. PayMe returns a `sale_url` — the hosted checkout page.
 *   6. The client redirects the browser to that URL.
 *   7. When payment completes, PayMe calls /api/webhooks/payme and we
 *      flip the registration to COMPLETED.
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

export async function generatePaymeSaleForWorkshop(
  workshopId: string,
): Promise<PaymeSaleResult> {
  if (!workshopId || typeof workshopId !== "string") {
    return { ok: false, error: "מזהה סדנה חסר" };
  }

  const sellerUid = process.env.PAYME_SELLER_UID;
  const apiUrl = process.env.PAYME_API_URL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (!sellerUid || !apiUrl || !siteUrl) {
    console.error("[payme] missing env: PAYME_SELLER_UID / PAYME_API_URL / NEXT_PUBLIC_SITE_URL");
    return { ok: false, error: "תצורת תשלום חסרה. אנא פנו למנהל." };
  }

  // 1. Auth
  const user = await getDbUser();
  if (!user) {
    return { ok: false, error: "יש להתחבר כדי להירשם לסדנה" };
  }

  // 2. Load workshop
  const workshop = await db.workshop.findUnique({ where: { id: workshopId } });
  if (!workshop || !workshop.isActive) {
    return { ok: false, error: "הסדנה לא נמצאה" };
  }
  if (workshop.date < new Date()) {
    return { ok: false, error: "הסדנה כבר התקיימה" };
  }

  // Duplicate / capacity checks
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
    // If we already have a PENDING row from this user, it's counted — allow it.
    const effectiveCount = existing && existing.paymentStatus === "PENDING" ? count : count + 1;
    if (effectiveCount > workshop.maxCapacity) {
      return { ok: false, error: "הסדנה מלאה" };
    }
  }

  // 3. Create (or reuse) a PENDING registration row
  const registration = existing
    ? await db.workshopRegistration.update({
        where: { id: existing.id },
        data: { paymentStatus: "PENDING" },
      })
    : await db.workshopRegistration.create({
        data: { userId: user.id, workshopId, paymentStatus: "PENDING" },
      });

  // 4. Call PayMe generate-sale
  // PayMe expects the price in agurot (ILS cents). Our Workshop.price is stored in whole ILS.
  const salePriceAgurot = Math.round(workshop.price * 100);

  const body = {
    seller_uid: sellerUid,
    sale_price: salePriceAgurot,
    currency: "ILS",
    product_name: workshop.title,
    sale_return_url: `${siteUrl}/workshops?success=true&registration=${registration.id}`,
    sale_callback_url: `${siteUrl}/api/webhooks/payme`,
    sale_back_url: `${siteUrl}/workshops?cancelled=true`,
    sale_customer_fields: { email: user.email, name: user.name ?? undefined },
    custom_1: registration.id,
    custom_2: user.id,
    custom_3: workshop.id,
  };

  let paymeResponse: PaymeGenerateSaleResponse;
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      // PayMe responds quickly; fail fast if it hangs.
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    try {
      paymeResponse = JSON.parse(text);
    } catch {
      console.error("[payme] non-JSON response:", res.status, text.slice(0, 300));
      return { ok: false, error: "שגיאת תקשורת עם ספק התשלום" };
    }

    if (!res.ok) {
      console.error("[payme] HTTP error:", res.status, paymeResponse);
      return {
        ok: false,
        error: paymeResponse.status_error_details || "שגיאת ספק התשלום",
      };
    }
  } catch (err) {
    console.error("[payme] fetch failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "לא ניתן להתחבר לספק התשלום. נסו שוב." };
  }

  // 5. Validate the sale URL
  if (paymeResponse.status_code !== 0 && paymeResponse.status_error_code) {
    console.error("[payme] sale failed:", paymeResponse);
    return {
      ok: false,
      error: paymeResponse.status_error_details || "לא ניתן ליצור דף תשלום",
    };
  }

  if (!paymeResponse.sale_url) {
    console.error("[payme] no sale_url in response:", paymeResponse);
    return { ok: false, error: "לא התקבל קישור תשלום" };
  }

  return { ok: true, url: paymeResponse.sale_url };
}
