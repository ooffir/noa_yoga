import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { paymentReceiptEmail, sendTransactionalEmail } from "@/lib/email";
import {
  creditsForPaymentType,
  productLabelFor,
} from "@/lib/product-catalog";
import { generateInvoice } from "@/lib/ypay";

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

  // ── Side effect 1: Email receipt (transactional, bypasses opt-out) ──
  const productLabel = productLabelFor(payment.type);
  const amountIls = payment.amount / 100; // amount stored in agurot
  const txId = paymeSaleCode ?? payment.paymentPageUid ?? payment.id;

  try {
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

  // ── Side effect 2: Ypay tax-receipt automation ──
  // Fire-and-forget — failure here MUST NOT roll back the payment
  // completion (the customer's card was already charged). All failure
  // modes are logged; activate the real Ypay integration by setting
  // YPAY_* env vars on Vercel (see src/lib/ypay.ts top-of-file docs).
  generateInvoice({
    internalRefId: paymentId,
    paymeSaleCode: paymeSaleCode ?? null,
    customerName: payment.user.name || "תלמידה יקרה",
    customerEmail: payment.user.email,
    productLabel,
    amountIls,
    transactionDate: new Date(),
  })
    .then((result) => {
      if (result.ok) {
        console.log("[payments] ypay invoice issued", {
          paymentId,
          invoiceNumber: result.invoiceNumber,
        });
      } else {
        console.warn("[payments] ypay invoice not issued", {
          paymentId,
          reason: result.reason,
        });
      }
    })
    .catch((err) => console.error("[payments] ypay threw:", err));

  return { kind: "completed", paymentId, credits };
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

  const workshopProductLabel = `סדנה: ${reg.workshop.title}`;

  // ── Side effect 1: Email receipt (transactional, bypasses opt-out) ──
  try {
    const { subject, html } = paymentReceiptEmail({
      name: reg.user.name || "תלמידה יקרה",
      productLabel: workshopProductLabel,
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

  // ── Side effect 2: Ypay tax-receipt automation ──
  // Fire-and-forget — never block the workshop completion on this.
  generateInvoice({
    internalRefId: reg.id,
    paymeSaleCode: null, // workshops don't currently store the sale code
    customerName: reg.user.name || "תלמידה יקרה",
    customerEmail: reg.user.email,
    productLabel: workshopProductLabel,
    amountIls: reg.workshop.price,
    transactionDate: new Date(),
  })
    .then((result) => {
      if (result.ok) {
        console.log("[payments] workshop ypay invoice issued", {
          registrationId,
          invoiceNumber: result.invoiceNumber,
        });
      } else {
        console.warn("[payments] workshop ypay invoice not issued", {
          registrationId,
          reason: result.reason,
        });
      }
    })
    .catch((err) => console.error("[payments] workshop ypay threw:", err));

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
//  Light status detector — kept here ONLY for the success page's URL-cancel
//  flow. The webhook owns its own copies of these (with broader detection).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect a failure/cancellation claim in a URL/payload.
 *
 * Used by /payments/success when the user is redirected back from PayMe
 * via the `sale_back_url` (cancel button). We don't need a full status
 * detector here — only enough to mark the Payment FAILED so the page
 * doesn't sit on the spinner waiting for a webhook that won't come.
 *
 * The webhook handler has its own, more comprehensive copies of all
 * status detection logic. They're independent because they serve
 * different paths and don't share trust assumptions.
 */
export function isPaymeFailure(
  payload: Record<string, string | undefined>,
): boolean {
  const status = (
    payload.payme_status ||
    payload.status ||
    payload.sale_status ||
    ""
  ).toLowerCase();
  return ["failed", "failure", "cancelled", "canceled", "error"].includes(
    status,
  );
}
