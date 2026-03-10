import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const paymentCouponRedemptionStatusEnum = pgEnum(
  "payment_coupon_redemption_status",
  ["active", "expired", "cancelled"],
);

// ============================================================================
// Tables
// ============================================================================

export const paymentCoupons = pgTable("payment_coupons", {
  ...baseColumns(),

  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  discountPercent: integer("discount_percent").notNull(),
  durationMonths: integer("duration_months").notNull(),

  applicablePlans: text("applicable_plans").array(),
  maxRedemptions: integer("max_redemptions"),
  currentRedemptions: integer("current_redemptions").notNull().default(0),

  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),

  isActive: boolean("is_active").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),

  createdBy: uuid("created_by").references(() => profiles.id),
});

export const paymentCouponRedemptions = pgTable(
  "payment_coupon_redemptions",
  {
    ...baseColumns(),

    couponId: uuid("coupon_id")
      .notNull()
      .references(() => paymentCoupons.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    // subscriptionId는 FK 없이 UUID만 저장 (순환 import 방지)
    subscriptionId: uuid("subscription_id").notNull(),

    discountPercent: integer("discount_percent").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    status: paymentCouponRedemptionStatusEnum("status")
      .notNull()
      .default("active"),
  },
  (table) => [
    unique("uq_payment_coupon_user").on(table.couponId, table.userId),
  ],
);

// ============================================================================
// Type Exports
// ============================================================================

export type PaymentCoupon = typeof paymentCoupons.$inferSelect;
export type NewPaymentCoupon = typeof paymentCoupons.$inferInsert;
export type PaymentCouponRedemption =
  typeof paymentCouponRedemptions.$inferSelect;
export type NewPaymentCouponRedemption =
  typeof paymentCouponRedemptions.$inferInsert;
export type CouponRedemptionStatus =
  (typeof paymentCouponRedemptionStatusEnum.enumValues)[number];
