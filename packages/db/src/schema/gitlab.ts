import {
	foreignKey,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { cloudWorkspaces, connections, environments } from "./schema";

function projectColumns() {
	return {
		connectionId: uuid("connection_id").notNull(),
		projectId: text("project_id").notNull(),
		pathWithNamespace: text("path_with_namespace").notNull(),
		cloneUrl: text("clone_url").notNull(),
		defaultBranch: text("default_branch").notNull().default("main"),
	};
}

export const gitlabCloudProjects = pgTable(
	"gitlab_cloud_projects",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id").notNull(),
		...projectColumns(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		foreignKey({
			name: "gitlab_cloud_projects_organization_id_fkey",
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
		}).onDelete("cascade"),
		foreignKey({
			name: "gitlab_cloud_projects_connection_id_fkey",
			columns: [table.connectionId],
			foreignColumns: [connections.id],
		}).onDelete("cascade"),
		index("gitlab_cloud_projects_organization_id_idx").on(table.organizationId),
		unique("gitlab_cloud_projects_connection_id_project_id_key").on(
			table.connectionId,
			table.projectId,
		),
	],
);

export const gitlabWorkspaceCheckouts = pgTable(
	"gitlab_workspace_checkouts",
	{
		cloudWorkspaceId: uuid("cloud_workspace_id").primaryKey(),
		...projectColumns(),
	},
	(table) => [
		index("gitlab_workspace_checkouts_connection_id_idx").on(
			table.connectionId,
		),
		foreignKey({
			name: "gitlab_workspace_checkouts_cloud_workspace_id_fkey",
			columns: [table.cloudWorkspaceId],
			foreignColumns: [cloudWorkspaces.id],
		}).onDelete("cascade"),
		foreignKey({
			name: "gitlab_workspace_checkouts_connection_id_fkey",
			columns: [table.connectionId],
			foreignColumns: [connections.id],
		}).onDelete("cascade"),
	],
);

export const gitlabEnvironmentProjects = pgTable(
	"gitlab_environment_projects",
	{
		environmentId: uuid("environment_id").primaryKey(),
		...projectColumns(),
	},
	(table) => [
		index("gitlab_environment_projects_connection_id_idx").on(
			table.connectionId,
		),
		foreignKey({
			name: "gitlab_environment_projects_environment_id_fkey",
			columns: [table.environmentId],
			foreignColumns: [environments.id],
		}).onDelete("cascade"),
		foreignKey({
			name: "gitlab_environment_projects_connection_id_fkey",
			columns: [table.connectionId],
			foreignColumns: [connections.id],
		}).onDelete("cascade"),
	],
);

export type InsertGitlabCloudProject = typeof gitlabCloudProjects.$inferInsert;
export type SelectGitlabCloudProject = typeof gitlabCloudProjects.$inferSelect;
export type InsertGitlabWorkspaceCheckout =
	typeof gitlabWorkspaceCheckouts.$inferInsert;
export type SelectGitlabWorkspaceCheckout =
	typeof gitlabWorkspaceCheckouts.$inferSelect;
export type InsertGitlabEnvironmentProject =
	typeof gitlabEnvironmentProjects.$inferInsert;
export type SelectGitlabEnvironmentProject =
	typeof gitlabEnvironmentProjects.$inferSelect;
