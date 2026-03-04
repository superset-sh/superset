import { db } from "@superset/db/client";
import {
	agentCommands,
	chatSessions,
	devicePresence,
	integrationConnections,
	invitations,
	members,
	organizations,
	projects,
	sessionHosts,
	subscriptions,
	taskStatuses,
	tasks,
	workspaces,
} from "@superset/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { QueryBuilder } from "drizzle-orm/pg-core";

export type AllowedTable =
	| "tasks"
	| "task_statuses"
	| "projects"
	| "auth.members"
	| "auth.organizations"
	| "auth.users"
	| "auth.invitations"
	| "auth.apikeys"
	| "device_presence"
	| "agent_commands"
	| "integration_connections"
	| "subscriptions"
	| "workspaces"
	| "chat_sessions"
	| "session_hosts";

interface WhereClause {
	fragment: string;
	params: unknown[];
}

function build(table: PgTable, column: PgColumn, id: string): WhereClause {
	const whereExpr = eq(sql`${sql.identifier(column.name)}`, id);
	const qb = new QueryBuilder();
	const { sql: query, params } = qb
		.select()
		.from(table)
		.where(whereExpr)
		.toSQL();
	const fragment = query.replace(/^select .* from .* where\s+/i, "");
	return { fragment, params };
}

export async function buildWhereClause(
	tableName: string,
	organizationId: string,
	userId: string,
): Promise<WhereClause | null> {
	switch (tableName) {
		case "tasks":
			return build(tasks, tasks.organizationId, organizationId);

		case "task_statuses":
			return build(taskStatuses, taskStatuses.organizationId, organizationId);

		case "projects":
			return build(projects, projects.organizationId, organizationId);

		case "auth.members":
			return build(members, members.organizationId, organizationId);

		case "auth.invitations":
			return build(invitations, invitations.organizationId, organizationId);

		case "auth.organizations": {
			// Use the authenticated user's ID to find their organizations
			const userMemberships = await db.query.members.findMany({
				where: eq(members.userId, userId),
				columns: { organizationId: true },
			});

			if (userMemberships.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}

			const orgIds = [...new Set(userMemberships.map((m) => m.organizationId))];
			const whereExpr = inArray(
				sql`${sql.identifier(organizations.id.name)}`,
				orgIds,
			);
			const qb = new QueryBuilder();
			const { sql: query, params } = qb
				.select()
				.from(organizations)
				.where(whereExpr)
				.toSQL();
			const fragment = query.replace(/^select .* from .* where\s+/i, "");
			return { fragment, params };
		}

		case "auth.users": {
			const fragment = `$1 = ANY("organization_ids")`;
			return { fragment, params: [organizationId] };
		}

		case "device_presence":
			return build(
				devicePresence,
				devicePresence.organizationId,
				organizationId,
			);

		case "agent_commands":
			return build(agentCommands, agentCommands.organizationId, organizationId);

		case "auth.apikeys": {
			const fragment = `"metadata" LIKE '%"organizationId":"' || $1 || '"%'`;
			return { fragment, params: [organizationId] };
		}

		case "integration_connections":
			return build(
				integrationConnections,
				integrationConnections.organizationId,
				organizationId,
			);

		case "subscriptions":
			return build(subscriptions, subscriptions.referenceId, organizationId);

		case "workspaces":
			return build(workspaces, workspaces.organizationId, organizationId);

		case "chat_sessions":
			return build(chatSessions, chatSessions.organizationId, organizationId);

		case "session_hosts":
			return build(sessionHosts, sessionHosts.organizationId, organizationId);

		default:
			return null;
	}
}
