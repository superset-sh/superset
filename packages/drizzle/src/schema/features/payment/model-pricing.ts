import { baseColumns } from "../../../utils";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";

// ============================================================================
// Tables
// ============================================================================

export const paymentModelPricing = pgTable("payment_model_pricing", {
  ...baseColumns(),

  modelId: text("model_id").notNull().unique(),
  provider: text("provider").notNull(),
  displayName: text("display_name").notNull(),

  inputCreditsPerKToken: integer("input_credits_per_k_token").notNull(),
  outputCreditsPerKToken: integer("output_credits_per_k_token").notNull(),

  isActive: boolean("is_active").notNull().default(true),
});

// ============================================================================
// Type Exports
// ============================================================================

export type PaymentModelPricing = typeof paymentModelPricing.$inferSelect;
export type NewPaymentModelPricing = typeof paymentModelPricing.$inferInsert;
