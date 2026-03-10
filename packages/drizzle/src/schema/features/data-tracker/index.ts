/**
 * Data Tracker Feature Schema
 * 사용자 데이터 수집 및 차트 시각화 시스템 -- 트래커 템플릿, 컬럼, 데이터 엔트리
 */
import { relations } from "drizzle-orm";
import { baseColumns, baseColumnsWithSoftDelete } from "../../../utils";
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
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const dataTrackerChartTypeEnum = pgEnum("data_tracker_chart_type", [
  "line",
  "bar",
  "pie",
]);

export const dataTrackerScopeEnum = pgEnum("data_tracker_scope", [
  "personal",
  "organization",
  "all",
]);

export const dataTrackerColumnTypeEnum = pgEnum("data_tracker_column_type", [
  "text",
  "number",
]);

export const dataTrackerSourceEnum = pgEnum("data_tracker_source", [
  "manual",
  "csv_import",
  "api",
]);

// ============================================================================
// Types (JSONB)
// ============================================================================

export type DataTrackerChartConfig = {
  yAxisKey?: string;
  groupByKey?: string;
  categoryKey?: string;
  valueKey?: string;
  aggregation: "sum" | "avg" | "count" | "min" | "max";
};

// ============================================================================
// Tables
// ============================================================================

/**
 * 데이터 트래커 (템플릿)
 *
 * Admin이 정의하는 트래커 템플릿. 컬럼 구조 + 차트 설정을 포함.
 */
export const dataTrackerTrackers = pgTable("data_tracker_trackers", {
  ...baseColumnsWithSoftDelete(),

  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  chartType: dataTrackerChartTypeEnum("chart_type").notNull(),
  chartConfig: jsonb("chart_config")
    .$type<DataTrackerChartConfig>()
    .notNull(),
  scope: dataTrackerScopeEnum("scope").notNull().default("all"),
  isActive: boolean("is_active").notNull().default(true),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
});

/**
 * 트래커 컬럼 정의
 *
 * 트래커별 데이터 컬럼 구조. 소프트 삭제 없이 트래커 삭제 시 CASCADE.
 */
export const dataTrackerColumns = pgTable(
  "data_tracker_columns",
  {
    ...baseColumns(),

    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => dataTrackerTrackers.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 100 }).notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    dataType: dataTrackerColumnTypeEnum("data_type").notNull(),
    isRequired: boolean("is_required").notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    index("idx_data_tracker_columns_tracker_sort").on(
      table.trackerId,
      table.sortOrder,
    ),
  ],
);

/**
 * 데이터 엔트리
 *
 * 사용자가 입력한 실제 데이터 행. JSONB로 유연한 컬럼 데이터 저장.
 */
export const dataTrackerEntries = pgTable(
  "data_tracker_entries",
  {
    ...baseColumnsWithSoftDelete(),

    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => dataTrackerTrackers.id, { onDelete: "cascade" }),
    date: date("date", { mode: "date" }).notNull(),
    data: jsonb("data").$type<Record<string, string | number>>().notNull(),
    source: dataTrackerSourceEnum("source").notNull().default("manual"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_data_tracker_entries_tracker_date").on(
      table.trackerId,
      table.date,
    ),
    index("idx_data_tracker_entries_tracker_user").on(
      table.trackerId,
      table.createdById,
    ),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const dataTrackerTrackersRelations = relations(
  dataTrackerTrackers,
  ({ one, many }) => ({
    createdBy: one(profiles, {
      fields: [dataTrackerTrackers.createdById],
      references: [profiles.id],
    }),
    columns: many(dataTrackerColumns),
    entries: many(dataTrackerEntries),
  }),
);

export const dataTrackerColumnsRelations = relations(
  dataTrackerColumns,
  ({ one }) => ({
    tracker: one(dataTrackerTrackers, {
      fields: [dataTrackerColumns.trackerId],
      references: [dataTrackerTrackers.id],
    }),
  }),
);

export const dataTrackerEntriesRelations = relations(
  dataTrackerEntries,
  ({ one }) => ({
    tracker: one(dataTrackerTrackers, {
      fields: [dataTrackerEntries.trackerId],
      references: [dataTrackerTrackers.id],
    }),
    createdBy: one(profiles, {
      fields: [dataTrackerEntries.createdById],
      references: [profiles.id],
    }),
  }),
);

// ============================================================================
// Type Exports
// ============================================================================

export type DataTrackerTracker = typeof dataTrackerTrackers.$inferSelect;
export type NewDataTrackerTracker = typeof dataTrackerTrackers.$inferInsert;

export type DataTrackerColumn = typeof dataTrackerColumns.$inferSelect;
export type NewDataTrackerColumn = typeof dataTrackerColumns.$inferInsert;

export type DataTrackerEntry = typeof dataTrackerEntries.$inferSelect;
export type NewDataTrackerEntry = typeof dataTrackerEntries.$inferInsert;
