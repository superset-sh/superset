import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { baseColumns } from "../../../utils";

// ============================================================================
// Enums
// ============================================================================

export const catalogGroupEnum = pgEnum("catalog_group", [
  "core",
  "content",
  "commerce",
  "system",
]);

export const dependencyTypeEnum = pgEnum("catalog_dependency_type", [
  "required",
  "recommended",
  "optional",
]);

// ============================================================================
// Types
// ============================================================================

export type TechStack = {
  server?: string[];
  client?: string[];
};

// ============================================================================
// Tables
// ============================================================================

export const catalogFeatures = pgTable("catalog_features", {
  ...baseColumns(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  group: catalogGroupEnum("group").notNull().default("content"),
  tags: jsonb("tags").$type<string[]>().default([]),
  previewImages: jsonb("preview_images").$type<string[]>().default([]),
  capabilities: jsonb("capabilities").$type<string[]>().default([]),
  techStack: jsonb("tech_stack").$type<TechStack>(),
  isCore: boolean("is_core").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(false),
  order: integer("order").notNull().default(0),
});

export const catalogDependencies = pgTable(
  "catalog_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => catalogFeatures.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => catalogFeatures.id, { onDelete: "cascade" }),
    dependencyType: dependencyTypeEnum("dependency_type")
      .notNull()
      .default("required"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_catalog_dep").on(table.featureId, table.dependsOnId),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const catalogFeaturesRelations = relations(
  catalogFeatures,
  ({ many }) => ({
    dependencies: many(catalogDependencies, {
      relationName: "featureDependencies",
    }),
    dependedBy: many(catalogDependencies, {
      relationName: "featureDependedBy",
    }),
  }),
);

export const catalogDependenciesRelations = relations(
  catalogDependencies,
  ({ one }) => ({
    feature: one(catalogFeatures, {
      fields: [catalogDependencies.featureId],
      references: [catalogFeatures.id],
      relationName: "featureDependencies",
    }),
    dependsOn: one(catalogFeatures, {
      fields: [catalogDependencies.dependsOnId],
      references: [catalogFeatures.id],
      relationName: "featureDependedBy",
    }),
  }),
);

// ============================================================================
// Type Exports
// ============================================================================

export type CatalogFeature = typeof catalogFeatures.$inferSelect;
export type NewCatalogFeature = typeof catalogFeatures.$inferInsert;
export type CatalogDependency = typeof catalogDependencies.$inferSelect;
export type NewCatalogDependency = typeof catalogDependencies.$inferInsert;
