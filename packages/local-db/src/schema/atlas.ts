import {
	blob,
	index,
	integer,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

/**
 * Atlas Projects table - tracks projects created via Atlas Composer
 */
export const atlasProjects = sqliteTable(
	"atlas_projects",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		name: text("name").notNull(),
		localPath: text("local_path").notNull(),
		features: text("features", { mode: "json" }).$type<string[]>().notNull(),
		gitInitialized: integer("git_initialized", { mode: "boolean" }).default(false),
		gitRemoteUrl: text("git_remote_url"),
		supabaseProjectId: text("supabase_project_id"),
		supabaseProjectUrl: text("supabase_project_url"),
		vercelProjectId: text("vercel_project_id"),
		vercelUrl: text("vercel_url"),
		vercelDeploymentId: text("vercel_deployment_id"),
		status: text("status").$type<"created" | "deployed" | "error">().notNull().default("created"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("atlas_projects_status_idx").on(table.status),
		index("atlas_projects_created_at_idx").on(table.createdAt),
	],
);

export type InsertAtlasProject = typeof atlasProjects.$inferInsert;
export type SelectAtlasProject = typeof atlasProjects.$inferSelect;

/**
 * Atlas Integrations - stores encrypted API tokens for external services
 */
export const atlasIntegrations = sqliteTable("atlas_integrations", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv4()),
	service: text("service").$type<"supabase" | "vercel">().notNull().unique(),
	encryptedToken: blob("encrypted_token", { mode: "buffer" }).notNull(),
	metadata: text("metadata", { mode: "json" }).$type<Record<string, string>>(),
	createdAt: integer("created_at")
		.notNull()
		.$defaultFn(() => Date.now()),
	updatedAt: integer("updated_at")
		.notNull()
		.$defaultFn(() => Date.now()),
});

export type InsertAtlasIntegration = typeof atlasIntegrations.$inferInsert;
export type SelectAtlasIntegration = typeof atlasIntegrations.$inferSelect;
