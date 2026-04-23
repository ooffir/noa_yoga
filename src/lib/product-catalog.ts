/**
 * Product catalog for credit purchases.
 *
 * Centralized here so every surface — pricing page, PayMe action,
 * webhook, payments.ts, receipt email, success page, admin payments
 * view — uses the EXACT same label + credit count for each product
 * type. Adding a new product means changing this file + the Prisma
 * enum only.
 */

export type CreditPurchaseType = "SINGLE_CLASS" | "PUNCH_CARD_5" | "PUNCH_CARD";

interface ProductDefinition {
  type: CreditPurchaseType;
  /** Number of credits granted on a successful payment. */
  credits: number;
  /** Hebrew display label used in: pricing cards, admin tables, receipts. */
  productLabel: string;
  /** Short label used in pending-payments compact rows. */
  shortLabel: string;
}

const PRODUCTS: Record<CreditPurchaseType, ProductDefinition> = {
  SINGLE_CLASS: {
    type: "SINGLE_CLASS",
    credits: 1,
    productLabel: "שיעור בודד",
    shortLabel: "שיעור בודד",
  },
  PUNCH_CARD_5: {
    type: "PUNCH_CARD_5",
    credits: 5,
    productLabel: "כרטיסיית 5 שיעורים",
    shortLabel: "כרטיסיית 5",
  },
  PUNCH_CARD: {
    type: "PUNCH_CARD",
    credits: 10,
    productLabel: "כרטיסיית 10 שיעורים",
    shortLabel: "כרטיסיית 10",
  },
};

export function getProductDefinition(
  type: CreditPurchaseType | string,
): ProductDefinition {
  return (
    PRODUCTS[type as CreditPurchaseType] ?? {
      type: "SINGLE_CLASS",
      credits: 1,
      productLabel: "שיעור בודד",
      shortLabel: "שיעור בודד",
    }
  );
}

export function creditsForPaymentType(type: string): number {
  return getProductDefinition(type).credits;
}

export function productLabelFor(type: string): string {
  return getProductDefinition(type).productLabel;
}

export function shortLabelFor(type: string): string {
  return getProductDefinition(type).shortLabel;
}
