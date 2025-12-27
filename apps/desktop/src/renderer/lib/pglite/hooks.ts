import { useLiveQuery } from "@electric-sql/pglite-react";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { database, getDb } from "./database";
import {
	localSettings,
	organizationMembers,
	organizations,
	type SelectLocalSettings,
	type SelectOrganization,
	type SelectTask,
	type SelectUser,
	tasks,
	users,
} from "./schema";

export function useTasks(organizationId: string) {
	const db = getDb();
	const query = db
		.select()
		.from(tasks)
		.where(
			and(eq(tasks.organization_id, organizationId), isNull(tasks.deleted_at)),
		)
		.orderBy(desc(tasks.created_at));

	const { sql, params } = query.toSQL();
	return useLiveQuery<SelectTask>(sql, params);
}

export function useOrganizations(userId: string) {
	const db = getDb();
	const query = db
		.select({
			id: organizations.id,
			clerk_org_id: organizations.clerk_org_id,
			name: organizations.name,
			slug: organizations.slug,
			github_org: organizations.github_org,
			avatar_url: organizations.avatar_url,
			created_at: organizations.created_at,
			updated_at: organizations.updated_at,
		})
		.from(organizations)
		.innerJoin(
			organizationMembers,
			eq(organizationMembers.organization_id, organizations.id),
		)
		.where(eq(organizationMembers.user_id, userId))
		.orderBy(organizations.name);

	const { sql, params } = query.toSQL();
	return useLiveQuery<SelectOrganization>(sql, params);
}

export function useUsers(userIds: string[]) {
	const db = getDb();
	const query = db
		.select()
		.from(users)
		.where(and(inArray(users.id, userIds), isNull(users.deleted_at)));

	const { sql, params } = query.toSQL();
	return useLiveQuery<SelectUser>(sql, params);
}

export function useActiveOrganizationIdQuery() {
	const db = getDb();
	const query = db.select().from(localSettings).where(eq(localSettings.id, 1));

	const { sql, params } = query.toSQL();
	const result = useLiveQuery<SelectLocalSettings>(sql, params);

	// result is undefined while loading, null/rows after loaded
	const isLoaded = result !== undefined;
	const activeOrganizationId =
		result?.rows?.[0]?.active_organization_id ?? null;

	return {
		activeOrganizationId,
		isLoaded,
	};
}

export async function setActiveOrganizationId(organizationId: string) {
	const { pg } = await database;
	await pg.query(
		`INSERT INTO local_settings (id, active_organization_id) VALUES (1, $1)
		 ON CONFLICT (id) DO UPDATE SET active_organization_id = $1`,
		[organizationId],
	);
}
