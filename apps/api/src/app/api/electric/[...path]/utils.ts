import { db } from "@superset/db/client";
import {
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
	| "auth.members"
	| "auth.organizations"
	| "auth.users";

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
): Promise<WhereClause | null> {
	switch (tableName) {
		case "tasks":
			return build(tasks, tasks.organizationId, organizationId);

		case "task_statuses":
			return build(taskStatuses, taskStatuses.organizationId, organizationId);

		case "repositories":
			return build(repositories, repositories.organizationId, organizationId);

		case "auth.members":
			return build(members, members.organizationId, organizationId);

		case "auth.organizations": {
			const userMemberships = await db.query.members.findMany({
				where: eq(members.organizationId, organizationId),
				columns: { userId: true },
			});

			if (userMemberships.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}

			const userId = userMemberships[0]?.userId;
			if (!userId) {
				return { fragment: "1 = 0", params: [] };
			}

			const allUserMemberships = await db.query.members.findMany({
				where: eq(members.userId, userId),
				columns: { organizationId: true },
			});

			if (allUserMemberships.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}

			const orgIds = [
				...new Set(allUserMemberships.map((m) => m.organizationId)),
			];
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
