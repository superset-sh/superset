/**
 * Payment Feature Schema
 * 결제, 구독, 라이선스 관련 테이블 (멀티 프로바이더 통합)
 */
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";

// ============================================================================
// Products Table
// ============================================================================

/**
 * Products 테이블
 * - 결제 프로바이더 제품 정보 동기화
 */
export const products = pgTable(
  "payment_products",
  {
    ...baseColumns(),

    // 프로바이더 정보
    externalId: text("external_id").notNull(),
    provider: text("provider").notNull().default("lemon-squeezy"),
    storeId: text("store_id").notNull(),

    // 제품 정보
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"), // draft, published

    // 가격 정보
    price: integer("price").notNull(), // cents
    currency: text("currency").notNull().default("USD"),

    // 구독 정보 (해당되는 경우)
    isSubscription: boolean("is_subscription").notNull().default(false),
    subscriptionInterval: text("subscription_interval"), // month, year
    subscriptionIntervalCount: integer("subscription_interval_count").default(1),

    // 라이선스 정보 (해당되는 경우)
    hasLicense: boolean("has_license").notNull().default(false),
    licenseLengthValue: integer("license_length_value"),
    licenseLengthUnit: text("license_length_unit"), // days, months, years

    // 메타데이터
    metadata: jsonb("metadata"),

    // 활성화 여부
    isActive: boolean("is_active").notNull().default(true),

    // 프로바이더 동기화 시간
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (table) => [unique("uq_payment_products_external_provider").on(table.externalId, table.provider)],
);

// ============================================================================
// Orders Table
// ============================================================================

export const paymentOrderStatusEnum = pgEnum("payment_order_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partial_refund",
  "fraudulent",
]);

/**
 * Orders 테이블
 * - 일회성 결제 주문
 */
export const orders = pgTable(
  "payment_orders",
  {
    ...baseColumns(),

    // 프로바이더 정보
    externalId: text("external_id").notNull(),
    provider: text("provider").notNull().default("lemon-squeezy"),
    orderNumber: integer("order_number").notNull(),

    // 관계
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id),

    // 고객 정보
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name"),

    // 주문 정보
    status: paymentOrderStatusEnum("status").notNull().default("pending"),
    statusFormatted: text("status_formatted"),

    // 가격 정보
    subtotal: integer("subtotal").notNull(), // 실제 금액 (cents)
    discount: integer("discount").notNull().default(0),
    tax: integer("tax").notNull().default(0),
    total: integer("total").notNull(),
    currency: text("currency").notNull().default("USD"),

    // 환불 정보
    refunded: boolean("refunded").notNull().default(false),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundAmount: integer("refund_amount"),

    // 테스트 모드
    testMode: boolean("test_mode").notNull().default(false),

    // 메타데이터
    metadata: jsonb("metadata"),
    urls: jsonb("urls"), // receipt 등
  },
  (table) => [unique("uq_payment_orders_external_provider").on(table.externalId, table.provider)],
);

// ============================================================================
// Subscriptions Table
// ============================================================================

/**
 * Subscriptions 테이블
 * - 구독 정보
 */
export const subscriptions = pgTable(
  "payment_subscriptions",
  {
    ...baseColumns(),

    // 프로바이더 정보
    externalId: text("external_id").notNull(),
    provider: text("provider").notNull().default("lemon-squeezy"),

    // 관계
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),

    // 고객 정보
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name"),

    // 구독 정보
    status: text("status").notNull(), // active, cancelled, expired, paused, past_due, unpaid
    statusFormatted: text("status_formatted"),

    // 가격 정보
    price: integer("price").notNull(), // 실제 금액 (cents)
    currency: text("currency").notNull().default("USD"),
    interval: text("interval").notNull(), // month, year
    intervalCount: integer("interval_count").notNull().default(1),

    // 날짜 정보
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    renewsAt: timestamp("renews_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),

    // 결제 정보
    billingAnchor: integer("billing_anchor"),
    firstSubscriptionItemId: text("first_subscription_item_id"),

    // 취소 정보
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    resumesAt: timestamp("resumes_at", { withTimezone: true }),

    // 테스트 모드
    testMode: boolean("test_mode").notNull().default(false),

    // 메타데이터
    metadata: jsonb("metadata"),
    urls: jsonb("urls"), // update_payment_method, customer_portal 등
  },
  (table) => [
    unique("uq_payment_subscriptions_external_provider").on(table.externalId, table.provider),
  ],
);

// ============================================================================
// Licenses Table
// ============================================================================

/**
 * Licenses 테이블
 * - 라이선스 키 관리
 */
export const licenses = pgTable(
  "payment_licenses",
  {
    ...baseColumns(),

    // 프로바이더 정보
    externalId: text("external_id").notNull(),
    provider: text("provider").notNull().default("lemon-squeezy"),

    // 관계
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),

    // 라이선스 정보
    key: text("key").notNull().unique(),
    status: text("status").notNull(), // inactive, active, expired, disabled
    statusFormatted: text("status_formatted"),

    // 활성화 정보
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // 활성화 제한
    activationLimit: integer("activation_limit"),
    activationUsage: integer("activation_usage").notNull().default(0),

    // 테스트 모드
    testMode: boolean("test_mode").notNull().default(false),

    // 메타데이터
    metadata: jsonb("metadata"),
  },
  (table) => [unique("uq_payment_licenses_external_provider").on(table.externalId, table.provider)],
);

// ============================================================================
// Webhook Events Table
// ============================================================================

/**
 * Webhook Events 테이블
 * - 결제 프로바이더 웹훅 이벤트 로그
 */
export const webhookEvents = pgTable("payment_webhook_events", {
  ...baseColumns(),

  // 프로바이더 정보
  provider: text("provider").notNull().default("lemon-squeezy"),

  // 이벤트 정보
  eventName: text("event_name").notNull(),
  eventId: text("event_id").notNull().unique(),

  // 처리 상태
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),

  // 에러 정보
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),

  // 페이로드
  payload: jsonb("payload").notNull(),

  // 테스트 모드
  testMode: boolean("test_mode").notNull().default(false),
});

// ============================================================================
// Refund Requests
// ============================================================================

export const paymentRefundRequestStatusEnum = pgEnum("payment_refund_request_status", [
  "pending",
  "processing",
  "approved",
  "rejected",
]);

export const paymentRefundReasonTypeEnum = pgEnum("payment_refund_reason_type", [
  "dissatisfied",
  "not_as_expected",
  "duplicate_payment",
  "changed_mind",
  "technical_issue",
  "other",
]);

export const refundRequests = pgTable("payment_refund_requests", {
  ...baseColumns(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  reasonType: paymentRefundReasonTypeEnum("reason_type").notNull(),
  reasonDetail: text("reason_detail"),
  requestedAmount: integer("requested_amount"),
  status: paymentRefundRequestStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  processedBy: uuid("processed_by").references(() => profiles.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

// ============================================================================
// Type Exports
// ============================================================================

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type OrderStatus = (typeof paymentOrderStatusEnum.enumValues)[number];
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

export type RefundRequest = typeof refundRequests.$inferSelect;
export type NewRefundRequest = typeof refundRequests.$inferInsert;

// Plans & Credits
export * from "./plans";
export * from "./credits";
export * from "./model-pricing";
export * from "./coupons";
