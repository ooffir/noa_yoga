import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
  typescript: true,
});

export const PRICES = {
  SINGLE_CLASS: process.env.STRIPE_SINGLE_CLASS_PRICE_ID!,
  PUNCH_CARD: process.env.STRIPE_PUNCH_CARD_PRICE_ID!,
};
