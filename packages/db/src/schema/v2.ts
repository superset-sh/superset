import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { githubRepositories } from "./github";

export const v2Projects = pgTable(
	"v2_projects",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		slug: text().notNull(),
		githubRepositoryId: uuid("github_repository_id").references(
			() => githubRepositories.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("v2_projects_organization_id_idx").on(table.organizationId),
		unique("v2_projects_org_slug_unique").on(table.organizationId, table.slug),
	],
);

export type InsertV2Project = typeof v2Projects.$inferInsert;
export type SelectV2Project = typeof v2Projects.$inferSelect;

export const v2Devices = pgTable(
	"v2_devices",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		type: text().notNull(), // "host" | "cloud" | "viewer"
		hashedDeviceId: text("hashed_device_id").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("v2_devices_organization_id_idx").on(table.organizationId),
		unique("v2_devices_org_hashed_device_id_unique").on(
			table.organizationId,
			table.hashedDeviceId,
		),
	],
);

export type InsertV2Device = typeof v2Devices.$inferInsert;
export type SelectV2Device = typeof v2Devices.$inferSelect;

export const v2Workspaces = pgTable(
	"v2_workspaces",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => v2Projects.id, { onDelete: "cascade" }),
		name: text().notNull(),
		branch: text().notNull().default("main"),
		deviceId: uuid("device_id").references(() => v2Devices.id, {
			onDelete: "set null",
		}),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("v2_workspaces_project_id_idx").on(table.projectId),
		index("v2_workspaces_organization_id_idx").on(table.organizationId),
	],
);

export type InsertV2Workspace = typeof v2Workspaces.$inferInsert;
export type SelectV2Workspace = typeof v2Workspaces.$inferSelect;
