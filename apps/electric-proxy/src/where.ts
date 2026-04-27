import {
	agentCommands,
	automationRuns,
	automations,
	chatSessions,
	devicePresence,
	githubPullRequests,
	githubRepositories,
	integrationConnections,
	invitations,
	members,
	organizations,
	projects,
	subscriptions,
	taskStatuses,
	tasks,
	v2Clients,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
	workspaces,
} from "@superset/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { QueryBuilder } from "drizzle-orm/pg-core";
import type { WhereClause } from "./auth";

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

export function buildWhereClause(
	tableName: string,
	organizationId: string,
	organizationIds: string[],
): WhereClause | null {
	switch (tableName) {
		case "tasks":
			return build(tasks, tasks.organizationId, organizationId);

		case "task_statuses":
			return build(taskStatuses, taskStatuses.organizationId, organizationId);

		case "projects":
			return build(projects, projects.organizationId, organizationId);

		case "v2_projects":
			return build(v2Projects, v2Projects.organizationId, organizationId);

		case "v2_hosts":
			return build(v2Hosts, v2Hosts.organizationId, organizationId);

		case "v2_clients":
			return build(v2Clients, v2Clients.organizationId, organizationId);

		case "v2_users_hosts":
			return build(v2UsersHosts, v2UsersHosts.organizationId, organizationId);

		case "v2_workspaces":
			return build(v2Workspaces, v2Workspaces.organizationId, organizationId);

		case "auth.members":
			return build(members, members.organizationId, organizationId);

		case "auth.invitations":
			return build(invitations, invitations.organizationId, organizationId);

		case "auth.organizations": {
			if (organizationIds.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}
			const whereExpr = inArray(
				sql`${sql.identifier(organizations.id.name)}`,
				organizationIds,
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

		case "github_repositories":
			return build(
				githubRepositories,
				githubRepositories.organizationId,
				organizationId,
			);

		case "github_pull_requests":
			return build(
				githubPullRequests,
				githubPullRequests.organizationId,
				organizationId,
			);

		case "automations":
			return build(automations, automations.organizationId, organizationId);

		case "automation_runs":
			return build(
				automationRuns,
				automationRuns.organizationId,
				organizationId,
			);

		default:
			return null;
	}
}
