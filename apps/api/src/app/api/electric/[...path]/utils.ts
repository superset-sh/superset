import { db } from "@superset/db/client";
import {
	organizationMembers,
	organizations,
	tasks,
	users,
} from "@superset/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { QueryBuilder } from "drizzle-orm/pg-core";

export type AllowedTable =
	| "tasks"
	| "organization_members"
	| "organizations"
	| "users";

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

		case "organization_members":
			return build(
				organizationMembers,
				organizationMembers.organizationId,
				organizationId,
			);

		case "organizations":
			return build(organizations, organizations.id, organizationId);

		// Users don't have organizationId - need to look up via membership
		case "users": {
			const members = await db.query.organizationMembers.findMany({
				where: eq(organizationMembers.organizationId, organizationId),
				columns: { userId: true },
			});
			const userIds = [...new Set(members.map((m) => m.userId))];
			const whereExpr = inArray(sql`${sql.identifier(users.id.name)}`, userIds);
			const qb = new QueryBuilder();
			const { sql: query, params } = qb
				.select()
				.from(users)
				.where(whereExpr)
				.toSQL();
			const fragment = query.replace(/^select .* from .* where\s+/i, "");
			return { fragment, params };
		}

		default:
			return null;
	}
}
