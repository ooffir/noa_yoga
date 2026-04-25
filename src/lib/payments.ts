import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { paymentReceiptEmail, sendTransactionalEmail } from "@/lib/email";
import {
  creditsForPaymentType,
  productLabelFor,
} from "@/lib/product-catalog";

/**
 * Payment completion helpers — shared by the PayMe webhook and the
 * post-payment /payments/success return-URL handler.
 *
 * All functions are idempotent — running twice has no extra effect.
 *
 * Receipts: every successful Payment triggers a transactional receipt
 * email via `sendTransactionalEmail`, which BYPASSES the user's
 * `receiveEmails` opt-out flag. Per Israeli consumer law, receipts for
 * paid transactions must always be delivered.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Credit / punch-card payments
// ─────────────────────────────────────────────────────────────────────────────

export type CompletePaymentResult =
  | { kind: "already_completed"; paymentId: string; credits: number }
  | { kind: "completed"; paymentId: string; credits: number }
  | { kind: "not_found" }
  | { kind: "refunded" }; // PayPlus/PayMe treat refunds separately; we only log

/**
 * Flip a Payment to COMPLETED and create the corresponding PunchCard.
 * Atomic: both happen in a single DB transaction, or neither does.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function completePaymentSuccess(
  paymentId: string,
  paymeSaleCode?: string | null,
): Promise<CompletePaymentResult> {
  console.log("[payments] complete:start", {
    paymentId,
    saleCodePreview: paymeSaleCode ? paymeSaleCode.slice(0, 8) + "…" : null,
  });

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!payment) {
    console.error("[payments] complete:not_found", { paymentId });
    return { kind: "not_found" };
  }

  if (payment.status === "COMPLETED") {
    const punchCard = await db.punchCard.findFirst({ where: { paymentId } });
    console.log("[payments] complete:already_completed", {
      paymentId,
      credits: punchCard?.totalCredits ?? 0,
    });
    return {
      kind: "already_completed",
      paymentId,
      credits: punchCard?.totalCredits ?? 0,
    };
  }

  if (payment.status === "REFUNDED") {
    console.log("[payments] complete:already_refunded", { paymentId });
    return { kind: "refunded" };
  }

  // Credits derived from the shared product catalog — single source of
  // truth. Adding a new product (e.g. PUNCH_CARD_20) only requires an
  // entry in src/lib/product-catalog.ts; this line needs no change.
  const credits = creditsForPaymentType(payment.type);

  console.log("[payments] complete:transacting", {
    paymentId,
    type: payment.type,
    credits,
    userId: payment.userId,
  });

  // Atomic: Payment → COMPLETED + PunchCard created.
  await db.$transaction([
    db.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        paymentPageUid: paymeSaleCode ?? payment.paymentPageUid,
      },
    }),
    db.punchCard.create({
      data: {
        userId: payment.userId,
        totalCredits: credits,
        remainingCredits: credits,
        paymentId,
      },
    }),
  ]);

  console.log("[payments] complete:OK", { paymentId, credits });

  // Revalidate surfaces that show credit balance.
  // NOTE: do NOT revalidate /payments/success — that page already has
  // `dynamic = "force-dynamic"` and revalidating it on every call was
  // adding pointless cache churn.
  try {
    revalidatePath("/profile");
    revalidatePath("/schedule");
  } catch {}

  // Fire-and-forget transactional receipt. Always sent — bypasses the
  // user's `receiveEmails` opt-out per consumer-law obligations.
  try {
    const productLabel = productLabelFor(payment.type);
    const amountIls = payment.amount / 100; // amount stored in agurot
    const txId = paymeSaleCode ?? payment.paymentPageUid ?? payment.id;
    const { subject, html } = paymentReceiptEmail({
      name: payment.user.name || "תלמידה יקרה",
      productLabel,
      amountIls,
      date: new Date(),
      transactionId: txId,
    });
    sendTransactionalEmail({ to: payment.user.email, subject, html }).catch(
      (err) => console.error("[payments] receipt email failed:", err),
    );
  } catch (err) {
    console.error("[payments] receipt email build failed:", err);
  }

  return { kind: "completed", paymentId, credits };
}

/**
 * Find a single PENDING Payment row matching the given amount that was
 * created within the last N minutes. Used as a fallback by the IPN
 * webhook when PayMe doesn't echo `custom_1` in the body — we still
 * have the captured amount, so we can usually identify the right row.
 *
 * Returns:
 *   - the unique matching Payment if exactly one is found
 *   - null if zero or 2+ matches (refuse to guess on ambiguity)
 */
export async function findRecentPendingPaymentByAmount(params: {
  amountAgurot: number;
  withinMinutes?: number;
}): Promise<{ id: string; userId: string; type: string } | null> {
  const withinMinutes = params.withinMinutes ?? 10;
  const since = new Date(Date.now() - withinMinutes * 60 * 1000);

  console.log("[payments] findByAmount:start", {
    amountAgurot: params.amountAgurot,
    withinMinutes,
  });

  const matches = await db.payment.findMany({
    where: {
      status: "PENDING",
      amount: params.amountAgurot,
      createdAt: { gte: since },
    },
    select: { id: true, userId: true, type: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log("[payments] findByAmount:result", { matchCount: matches.length });

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return null;

  console.error("[payments] findByAmount:ambiguous", {
    matchCount: matches.length,
    amountAgurot: params.amountAgurot,
  });
  return null;
}

export async function failPayment(paymentId: string): Promise<void> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PENDING") return;
  await db.payment.update({
    where: { id: paymentId },
    data: { status: "FAILED" },
  });
}

/**
 * Mark a previously COMPLETED Payment as REFUNDED and revoke the
 * associated PunchCard. Idempotent — second call is a no-op.
 *
 * Called when PayMe's webhook signals `sale_status: "refunded"` (i.e.
 * Noa issued a refund in the PayMe dashboard). Wraps the two updates
 * in a transaction so we never end up with REFUNDED payment + still
 * active punch card.
 *
 * We don't try to "take back" credits that were already spent on
 * bookings — that would invalidate legitimate bookings the student
 * already attended. We only zero out the remainingCredits on the
 * card, so they can't spend anything further.
 */
export async function refundPayment(
  paymentId: string,
): Promise<{ kind: "refunded" | "already_refunded" | "not_found" | "not_completed" }> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { punchCard: true },
  });
  if (!payment) return { kind: "not_found" };
  if (payment.status === "REFUNDED") return { kind: "already_refunded" };
  if (payment.status !== "COMPLETED") return { kind: "not_completed" };

  await db.$transaction([
    db.payment.update({
      where: { id: paymentId },
      data: { status: "REFUNDED" },
    }),
    // Freeze the punch card: zero remaining credits + mark EXHAUSTED.
    // A null branch covers a rare state where the Payment succeeded but
    // the PunchCard row never got created (e.g. partial write).
    ...(payment.punchCard
      ? [
          db.punchCard.update({
            where: { id: payment.punchCard.id },
            data: {
              remainingCredits: 0,
              status: "EXHAUSTED",
            },
          }),
        ]
      : []),
  ]);

  try {
    revalidatePath("/profile");
    revalidatePath("/schedule");
  } catch {}

  console.warn(
    `[payments] refund applied: paymentId=${paymentId}, punchCardId=${payment.punchCard?.id ?? "none"}`,
  );
  return { kind: "refunded" };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Workshop registrations
// ─────────────────────────────────────────────────────────────────────────────

export type CompleteWorkshopResult =
  | { kind: "already_completed"; registrationId: string }
  | { kind: "completed"; registrationId: string }
  | { kind: "not_found" };

export async function completeWorkshopSuccess(
  registrationId: string,
): Promise<CompleteWorkshopResult> {
  const reg = await db.workshopRegistration.findUnique({
    where: { id: registrationId },
    include: {
      user: { select: { email: true, name: true } },
      workshop: { select: { title: true, price: true } },
    },
  });
  if (!reg) return { kind: "not_found" };

  if (reg.paymentStatus === "COMPLETED") {
    return { kind: "already_completed", registrationId };
  }

  await db.workshopRegistration.update({
    where: { id: registrationId },
    data: { paymentStatus: "COMPLETED" },
  });

  try {
    revalidatePath("/workshops");
  } catch {}

  // Fire-and-forget transactional receipt (always sent, bypasses opt-out).
  try {
    const { subject, html } = paymentReceiptEmail({
      name: reg.user.name || "תלמידה יקרה",
      productLabel: `סדנה: ${reg.workshop.title}`,
      amountIls: reg.workshop.price,
      date: new Date(),
      transactionId: reg.id,
    });
    sendTransactionalEmail({ to: reg.user.email, subject, html }).catch((err) =>
      console.error("[payments] workshop receipt email failed:", err),
    );
  } catch (err) {
    console.error("[payments] workshop receipt email build failed:", err);
  }

  return { kind: "completed", registrationId };
}

export async function cancelWorkshop(registrationId: string): Promise<void> {
  const reg = await db.workshopRegistration.findUnique({ where: { id: registrationId } });
  if (!reg || reg.paymentStatus !== "PENDING") return;
  await db.workshopRegistration.update({
    where: { id: registrationId },
    data: { paymentStatus: "CANCELLED" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  custom_1 dispatch helpers (shared between webhook and return-URL flow)
// ─────────────────────────────────────────────────────────────────────────────

export type SaleKind = "workshop" | "payment";
export interface ResolvedCustomRef {
  kind: SaleKind;
  id: string;
}

export function resolveCustomRef(custom1: string | null | undefined): ResolvedCustomRef | null {
  if (!custom1) return null;
  if (custom1.startsWith("wsr:")) return { kind: "workshop", id: custom1.slice(4) };
  if (custom1.startsWith("pay:")) return { kind: "payment", id: custom1.slice(4) };
  // Legacy raw-UUID workshop registrations (pre-prefix).
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(custom1)) {
    return { kind: "workshop", id: custom1 };
  }
  return null;
}

/**
 * Accepts a raw PayMe payload (from webhook OR return-URL query params)
 * and returns whether PayMe reports this sale as successful.
 *
 * Recognises every PayMe status-field variant we've encountered across
 * different seller accounts and API versions:
 *   - payme_status
 *   - status
 *   - sale_status
 *   - transaction_status
 *   - payment_status
 *
 * And every "captured / paid / approved" spelling:
 *   - "success", "succeed", "successful"
 *   - "captured", "capture"
 *   - "paid", "approved", "completed", "done"
 *   - numeric "1"
 *
 * status_code "0" is the PayMe convention for "API call OK" — when
 * combined with a captured-status field it confirms the sale completed.
 */
export function isPaymeSuccess(payload: Record<string, string | undefined>): boolean {
  const candidates = [
    payload.payme_status,
    payload.status,
    payload.sale_status,
    payload.transaction_status,
    payload.payment_status,
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());

  const matchesAny = candidates.some((s) =>
    [
      "success",
      "succeed",
      "successful",
      "captured",
      "capture",
      "paid",
      "approved",
      "completed",
      "done",
      "1",
    ].includes(s),
  );

  if (matchesAny) return true;

  // status_code "0" alone isn't enough (it just means "API responded OK"),
  // but if combined with ANY of our status candidates being non-failure,
  // treat as success. Used by older PayMe webhook variants.
  if (payload.status_code === "0" && candidates.length === 0) {
    return true;
  }

  return false;
}

export function isPaymeFailure(payload: Record<string, string | undefined>): boolean {
  const status = (payload.payme_status || payload.status || "").toLowerCase();
  return (
    status === "failed" ||
    status === "failure" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "error"
  );
}

/**
 * Detect a refund callback from PayMe. PayMe uses (at least) these
 * spellings depending on endpoint/region:
 *   - payme_sale_status: "refunded"
 *   - sale_status:       "refunded"
 *   - type:              "refund"
 */
export function isPaymeRefund(payload: Record<string, string | undefined>): boolean {
  const status = (
    payload.payme_sale_status ||
    payload.sale_status ||
    payload.payme_status ||
    payload.status ||
    ""
  ).toLowerCase();
  const type = (payload.type || payload.event || "").toLowerCase();
  return status === "refunded" || status === "refund" || type === "refund";
}
