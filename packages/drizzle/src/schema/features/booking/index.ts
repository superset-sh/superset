/**
 * Booking Feature Schema
 * 예약 상담 매칭 시스템 — 카테고리, 상담사, 세션 상품, 스케줄, 예약, 환불 정책
 */
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const bookingProviderStatusEnum = pgEnum("booking_provider_status", [
  "pending_review",
  "active",
  "inactive",
  "suspended",
]);

export const bookingProductStatusEnum = pgEnum("booking_product_status", [
  "active",
  "inactive",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending_payment",
  "confirmed",
  "completed",
  "no_show",
  "cancelled_by_user",
  "cancelled_by_provider",
  "refunded",
  "expired",
]);

export const bookingConsultationModeEnum = pgEnum("booking_consultation_mode", [
  "online",
  "offline",
  "hybrid",
]);

export const bookingOverrideTypeEnum = pgEnum("booking_override_type", [
  "unavailable",
  "available",
]);

// ============================================================================
// Types
// ============================================================================

export type RefundRule = {
  hours_before: number;
  refund_percentage: number;
};

// ============================================================================
// Tables
// ============================================================================

/**
 * 상담 카테고리
 *
 * 상담 분야를 분류하는 카테고리 테이블 (예: 법률, 세무, 심리 등)
 */
export const bookingCategories = pgTable("booking_categories", {
  ...baseColumns(),

  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  icon: varchar("icon", { length: 50 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/**
 * 상담사 프로필
 *
 * 상담을 제공하는 전문가 정보. profiles 테이블과 1:1 관계.
 */
export const bookingProviders = pgTable(
  "booking_providers",
  {
    ...baseColumns(),

    profileId: uuid("profile_id")
      .notNull()
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    bio: text("bio"),
    experienceYears: integer("experience_years"),
    consultationMode: bookingConsultationModeEnum("consultation_mode")
      .notNull()
      .default("online"),
    languages: text("languages").array().notNull().default(["ko"]),
    status: bookingProviderStatusEnum("status").notNull().default("inactive"),
  },
  (table) => [
    index("idx_booking_providers_profile").on(table.profileId),
    index("idx_booking_providers_status").on(table.status),
  ],
);

/**
 * 상담사-카테고리 연결 (N:M)
 *
 * 한 상담사가 여러 카테고리를, 한 카테고리에 여러 상담사가 속할 수 있음.
 */
export const bookingProviderCategories = pgTable(
  "booking_provider_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => bookingProviders.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => bookingCategories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("booking_provider_categories_unique").on(
      table.providerId,
      table.categoryId,
    ),
  ],
);

/**
 * 세션 상품 (상담 상품)
 *
 * 예약 가능한 상담 상품 정의 (시간, 가격 등)
 */
export const bookingSessionProducts = pgTable("booking_session_products", {
  ...baseColumns(),

  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull(),
  price: integer("price").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
  status: bookingProductStatusEnum("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * 상담사-상품 연결 (N:M)
 *
 * 한 상담사가 여러 상품을, 한 상품을 여러 상담사가 제공할 수 있음.
 */
export const bookingProviderProducts = pgTable(
  "booking_provider_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => bookingProviders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => bookingSessionProducts.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("booking_provider_products_unique").on(
      table.providerId,
      table.productId,
    ),
  ],
);

/**
 * 주간 스케줄
 *
 * 상담사의 요일별 반복 근무 시간 설정
 */
export const bookingWeeklySchedules = pgTable(
  "booking_weekly_schedules",
  {
    ...baseColumns(),

    providerId: uuid("provider_id")
      .notNull()
      .references(() => bookingProviders.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0=일 ~ 6=토
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("booking_weekly_schedules_unique").on(
      table.providerId,
      table.dayOfWeek,
      table.startTime,
    ),
    index("idx_booking_schedules_provider").on(table.providerId),
  ],
);

/**
 * 스케줄 오버라이드 (특정 날짜 예외)
 *
 * 상담사가 특정 날짜에 휴무이거나 추가 근무를 설정하는 경우
 */
export const bookingScheduleOverrides = pgTable(
  "booking_schedule_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => bookingProviders.id, { onDelete: "cascade" }),
    date: date("date", { mode: "date" }).notNull(),
    overrideType: bookingOverrideTypeEnum("override_type").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_booking_overrides_provider_date").on(
      table.providerId,
      table.date,
    ),
  ],
);

/**
 * 예약
 *
 * 고객이 상담사에게 예약한 상담 내역. 전체 예약 라이프사이클 관리.
 */
export const bookingBookings = pgTable(
  "booking_bookings",
  {
    ...baseColumns(),

    // 참여자
    customerId: uuid("customer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => bookingProviders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => bookingSessionProducts.id, { onDelete: "cascade" }),

    // 일정
    sessionDate: date("session_date", { mode: "date" }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),

    // 상태
    status: bookingStatusEnum("status").notNull().default("pending_payment"),
    consultationMode: bookingConsultationModeEnum("consultation_mode").notNull(),
    meetingLink: text("meeting_link"),
    location: text("location"),

    // 결제
    paymentAmount: integer("payment_amount").notNull(),
    paymentReference: text("payment_reference"),
    refundAmount: integer("refund_amount"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),

    // 취소
    cancellationReason: text("cancellation_reason"),
    cancelledBy: uuid("cancelled_by").references(() => profiles.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    // 슬롯 잠금 + 완료
    slotLockedUntil: timestamp("slot_locked_until", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_booking_bookings_customer").on(table.customerId),
    index("idx_booking_bookings_provider").on(table.providerId),
    index("idx_booking_bookings_status").on(table.status),
    index("idx_booking_bookings_provider_session").on(
      table.providerId,
      table.sessionDate,
      table.startTime,
    ),
  ],
);

/**
 * 환불 정책
 *
 * 시간대별 환불 비율, 노쇼/상담사 취소 시 환불 정책 정의
 */
export const bookingRefundPolicy = pgTable("booking_refund_policy", {
  ...baseColumns(),

  name: varchar("name", { length: 200 }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  rules: jsonb("rules").$type<RefundRule[]>().notNull(),
  noShowRefundPercentage: integer("no_show_refund_percentage")
    .notNull()
    .default(0),
  providerCancelRefundPercentage: integer(
    "provider_cancel_refund_percentage",
  )
    .notNull()
    .default(100),
  isActive: boolean("is_active").notNull().default(true),
});

// ============================================================================
// Type Exports
// ============================================================================

// Enum literal types
export type BookingProviderStatus =
  | "pending_review"
  | "active"
  | "inactive"
  | "suspended";
export type BookingProductStatus = "active" | "inactive";
export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled_by_user"
  | "cancelled_by_provider"
  | "refunded"
  | "expired";
export type BookingConsultationMode = "online" | "offline" | "hybrid";
export type BookingOverrideType = "unavailable" | "available";

// Table inferred types
export type BookingCategory = typeof bookingCategories.$inferSelect;
export type NewBookingCategory = typeof bookingCategories.$inferInsert;

export type BookingProvider = typeof bookingProviders.$inferSelect;
export type NewBookingProvider = typeof bookingProviders.$inferInsert;

export type BookingProviderCategory =
  typeof bookingProviderCategories.$inferSelect;
export type NewBookingProviderCategory =
  typeof bookingProviderCategories.$inferInsert;

export type BookingSessionProduct = typeof bookingSessionProducts.$inferSelect;
export type NewBookingSessionProduct =
  typeof bookingSessionProducts.$inferInsert;

export type BookingProviderProduct =
  typeof bookingProviderProducts.$inferSelect;
export type NewBookingProviderProduct =
  typeof bookingProviderProducts.$inferInsert;

export type BookingWeeklySchedule =
  typeof bookingWeeklySchedules.$inferSelect;
export type NewBookingWeeklySchedule =
  typeof bookingWeeklySchedules.$inferInsert;

export type BookingScheduleOverride =
  typeof bookingScheduleOverrides.$inferSelect;
export type NewBookingScheduleOverride =
  typeof bookingScheduleOverrides.$inferInsert;

export type BookingBooking = typeof bookingBookings.$inferSelect;
export type NewBookingBooking = typeof bookingBookings.$inferInsert;

export type BookingRefundPolicy = typeof bookingRefundPolicy.$inferSelect;
export type NewBookingRefundPolicy = typeof bookingRefundPolicy.$inferInsert;
