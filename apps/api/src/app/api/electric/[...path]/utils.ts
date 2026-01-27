import { db } from "@superset/db/client";
import {
	chatMessages,
	chatParticipants,
	chatSessions,
	invitations,
	members,
	organizations,
	repositories,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { QueryBuilder } from "drizzle-orm/pg-core";

export type AllowedTable =
	| "tasks"
	| "task_statuses"
	| "repositories"
	| "chat_sessions"
	| "chat_messages"
	| "chat_participants"
	| "auth.members"
	| "auth.organizations"
	| "auth.users"
	| "auth.invitations";

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

		case "repositories":
			return build(repositories, repositories.organizationId, organizationId);

		case "chat_sessions":
			return build(chatSessions, chatSessions.organizationId, organizationId);

		case "chat_messages":
			return build(chatMessages, chatMessages.organizationId, organizationId);

		case "chat_participants": {
			// Filter participants by sessions the user's org owns
			const orgSessions = await db.query.chatSessions.findMany({
				where: eq(chatSessions.organizationId, organizationId),
				columns: { id: true },
			});

			if (orgSessions.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}

			const sessionIds = orgSessions.map((s) => s.id);
			const whereExpr = inArray(
				sql`${sql.identifier(chatParticipants.sessionId.name)}`,
				sessionIds,
			);
			const qb = new QueryBuilder();
			const { sql: query, params } = qb
				.select()
				.from(chatParticipants)
				.where(whereExpr)
				.toSQL();
			const fragment = query.replace(/^select .* from .* where\s+/i, "");
			return { fragment, params };
		}

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

		default:
			return null;
	}
}
