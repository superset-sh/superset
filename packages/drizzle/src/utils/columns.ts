import { boolean, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 공통 ID 컬럼 (UUID)
 */
export const id = () => uuid("id").primaryKey().defaultRandom();

/**
 * 생성/수정 시간 컬럼
 */
export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Soft Delete 컬럼
 */
export const softDelete = () => ({
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

/**
 * 모든 공통 컬럼 조합 (id + timestamps)
 */
export const baseColumns = () => ({
  id: id(),
  ...timestamps(),
});

/**
 * 모든 공통 컬럼 + Soft Delete
 */
export const baseColumnsWithSoftDelete = () => ({
  ...baseColumns(),
  ...softDelete(),
});
