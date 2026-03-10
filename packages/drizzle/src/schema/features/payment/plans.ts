import { baseColumns } from "../../../utils";
import { boolean, integer, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const paymentPlanTierEnum = pgEnum("payment_plan_tier", [
  "free",
  "pro",
  "team",
  "enterprise",
]);

// ============================================================================
// Tables
// ============================================================================

export const paymentPlans = pgTable("payment_plans", {
  ...baseColumns(),

  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  tier: paymentPlanTierEnum("tier").notNull(),

  monthlyCredits: integer("monthly_credits").notNull(),

  price: integer("price").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  interval: text("interval").default("month"),

  providerProductId: text("provider_product_id"),
  providerVariantId: text("provider_variant_id"),
  provider: text('provider').notNull().default('lemon-squeezy'),

  isPerSeat: boolean("is_per_seat").notNull().default(false),
  features: jsonb("features").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ============================================================================
// Type Exports
// ============================================================================

export type PaymentPlan = typeof paymentPlans.$inferSelect;
export type NewPaymentPlan = typeof paymentPlans.$inferInsert;
