import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";
import { paymentPlans } from "./plans";
import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const paymentCreditTransactionTypeEnum = pgEnum("payment_credit_transaction_type", [
  "allocation",
  "deduction",
  "purchase",
  "refund",
  "adjustment",
  "expiration",
]);

// ============================================================================
// Tables
// ============================================================================

export const paymentCreditBalances = pgTable("payment_credit_balances", {
  ...baseColumns(),

  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => paymentPlans.id),

  balance: integer("balance").notNull().default(0),
  monthlyAllocation: integer("monthly_allocation").notNull().default(0),

  autoRecharge: boolean("auto_recharge").notNull().default(false),
  autoRechargeAmount: integer("auto_recharge_amount"),
  autoRechargeThreshold: integer("auto_recharge_threshold"),

  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  lastRechargedAt: timestamp("last_recharged_at", { withTimezone: true }),
});

export const paymentCreditTransactions = pgTable("payment_credit_transactions", {
  ...baseColumns(),

  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: paymentCreditTransactionTypeEnum("type").notNull(),

  amount: integer("amount").notNull(),
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),

  description: text("description"),
  metadata: jsonb("metadata").$type<{
    modelId?: string;
    provider?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    messageId?: string;
    threadId?: string;
  }>(),

  relatedOrderId: uuid("related_order_id"), // No FK ref to avoid circular import
});

// ============================================================================
// Type Exports
// ============================================================================

export type PaymentCreditBalance = typeof paymentCreditBalances.$inferSelect;
export type NewPaymentCreditBalance = typeof paymentCreditBalances.$inferInsert;

export type PaymentCreditTransaction = typeof paymentCreditTransactions.$inferSelect;
export type NewPaymentCreditTransaction = typeof paymentCreditTransactions.$inferInsert;
