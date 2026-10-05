import type { PaidProduct, PlanName } from "@snapforge/database";

type ProductDefinition = Omit<PaidProduct, "id"> & { id: string | undefined };

export const BILLING_PRODUCTS = {
  pro: { id: process.env.DODO_PRODUCT_PRO, credits: 10_000, kind: "subscription", plan: "pro" },
  scale: { id: process.env.DODO_PRODUCT_SCALE, credits: 100_000, kind: "subscription", plan: "scale" },
  credits_10k: { id: process.env.DODO_PRODUCT_CREDITS_10K, credits: 10_000, kind: "credits" },
  credits_50k: { id: process.env.DODO_PRODUCT_CREDITS_50K, credits: 50_000, kind: "credits" },
  credits_250k: { id: process.env.DODO_PRODUCT_CREDITS_250K, credits: 250_000, kind: "credits" },
} as const satisfies Record<string, ProductDefinition>;

export type BillingProduct = keyof typeof BILLING_PRODUCTS;

export function productForId(id: string | undefined): (PaidProduct & { id: string }) | undefined {
  const product = Object.values(BILLING_PRODUCTS).find((candidate) => candidate.id && candidate.id === id);
  return product?.id ? product as PaidProduct & { id: string } : undefined;
}

export function planFromMetadata(value: unknown): PlanName | undefined {
  return value === "pro" || value === "scale" ? value : undefined;
}
