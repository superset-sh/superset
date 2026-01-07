import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
	members,
	organizations,
	repositories,
	tasks,
	users,
} from "@superset/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { QueryBuilder } from "drizzle-orm/pg-core";

export type AllowedTable =
	| "tasks"
	| "repositories"
	| "github_repositories"
	| "github_pull_requests"
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

		case "repositories":
			return build(repositories, repositories.organizationId, organizationId);

		case "github_repositories": {
			// Get the GitHub installation for this organization
			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, organizationId),
				columns: { id: true },
			});

			if (!installation) {
				return { fragment: "1 = 0", params: [] };
			}

			return build(
				githubRepositories,
				githubRepositories.installationId,
				installation.id,
			);
		}

		case "github_pull_requests": {
			// Get the GitHub installation for this organization
			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, organizationId),
				columns: { id: true },
			});

			if (!installation) {
				return { fragment: "1 = 0", params: [] };
			}

			// Get all repositories for this installation
			const repos = await db.query.githubRepositories.findMany({
				where: eq(githubRepositories.installationId, installation.id),
				columns: { id: true },
			});

			if (repos.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}

			const repoIds = repos.map((r) => r.id);
			const whereExpr = inArray(
				sql`${sql.identifier(githubPullRequests.repositoryId.name)}`,
				repoIds,
			);
			const qb = new QueryBuilder();
			const { sql: query, params } = qb
				.select()
				.from(githubPullRequests)
				.where(whereExpr)
				.toSQL();
			const fragment = query.replace(/^select .* from .* where\s+/i, "");
			return { fragment, params };
		}

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
			const orgMembers = await db.query.members.findMany({
				where: eq(members.organizationId, organizationId),
				columns: { userId: true },
			});
			if (orgMembers.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}
			const userIds = [...new Set(orgMembers.map((m) => m.userId))];
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
