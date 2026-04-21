import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

/**
 * Payment completion helpers — shared by the PayMe webhook and the
 * post-payment /payments/success return-URL handler.
 *
 * All functions are idempotent — running twice has no extra effect.
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
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    console.warn("[payments] completePaymentSuccess: payment not found:", paymentId);
    return { kind: "not_found" };
  }

  if (payment.status === "COMPLETED") {
    const punchCard = await db.punchCard.findFirst({ where: { paymentId } });
    return {
      kind: "already_completed",
      paymentId,
      credits: punchCard?.totalCredits ?? 0,
    };
  }

  if (payment.status === "REFUNDED") return { kind: "refunded" };

  const credits = payment.type === "PUNCH_CARD" ? 10 : 1;

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

  // Revalidate surfaces that show credit balance.
  try {
    revalidatePath("/profile");
    revalidatePath("/schedule");
    revalidatePath("/payments/success");
  } catch {}

  console.log("[payments] completePaymentSuccess OK:", paymentId, `+${credits} credits`);
  return { kind: "completed", paymentId, credits };
}

export async function failPayment(paymentId: string): Promise<void> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PENDING") return;
  await db.payment.update({
    where: { id: paymentId },
    data: { status: "FAILED" },
  });
  console.log("[payments] failPayment:", paymentId);
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
  const reg = await db.workshopRegistration.findUnique({ where: { id: registrationId } });
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

  console.log("[payments] completeWorkshopSuccess OK:", registrationId);
  return { kind: "completed", registrationId };
}

export async function cancelWorkshop(registrationId: string): Promise<void> {
  const reg = await db.workshopRegistration.findUnique({ where: { id: registrationId } });
  if (!reg || reg.paymentStatus !== "PENDING") return;
  await db.workshopRegistration.update({
    where: { id: registrationId },
    data: { paymentStatus: "CANCELLED" },
  });
  console.log("[payments] cancelWorkshop:", registrationId);
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
 * Tolerant of different field-name variations PayMe has used over time.
 */
export function isPaymeSuccess(payload: Record<string, string | undefined>): boolean {
  const status = (payload.payme_status || payload.status || "").toLowerCase();
  return (
    status === "success" ||
    status === "1" ||
    payload.status_code === "0" ||
    payload.payme_status === "1"
  );
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
