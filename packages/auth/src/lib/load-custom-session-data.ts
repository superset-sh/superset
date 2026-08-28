import { db } from "@superset/db/client";
import type { SelectMember } from "@superset/db/schema/auth";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { sql } from "drizzle-orm";

/**
 * Everything `customSession` needs, in one round trip.
 *
 * These were three sequential drizzle calls — memberships, then the active
 * organization's subscription, then the user's own row. Neon speaks HTTP, so
 * each call is its own request, and with the database in a different region to
 * the functions that was ~220ms on every authenticated request in the product.
 * Only the active-organization fallback made the order matter, and that is
 * expressible in SQL, so the three collapse into one statement.
 *
 * Raw SQL rather than drizzle's query builder because the point is the single
 * statement; expressing the fallback across three builder calls is what we are
 * replacing.
 */
export interface CustomSessionData {
	memberships: SelectMember[];
	/**
	 * The organization the plan below belongs to. A concurrent request can move
	 * the session's active organization between this query and the caller
	 * settling on one, so the caller compares before trusting `plan`.
	 */
	planOrganizationId: string | null;
	plan: string | null;
	/** The organization the user last switched to; the fallback a new session
	 * resumes from before the newest membership is considered. */
	lastActiveOrganizationId: string | null;
	onboardedAt: Date | null;
	deletionRequestedAt: Date | null;
}

interface CustomSessionRow extends Record<string, unknown> {
	memberships: Array<{
		id: string;
		organizationId: string;
		userId: string;
		role: string;
		createdAt: string;
	}> | null;
	active_organization_id: string | null;
	plan: string | null;
	last_active_organization_id: string | null;
	onboarded_at: string | Date | null;
	deletion_requested_at: string | Date | null;
}

/**
 * These are `timestamp` columns, so Postgres hands back a naive string with no
 * zone. `new Date()` reads that as local time, which silently shifts every
 * value by the server's offset; drizzle's own mapping treats it as UTC, so
 * match that or the onboarding gate moves by hours depending on where the
 * function ran.
 */
function toDate(value: string | Date | null): Date | null {
	if (value === null) return null;
	if (value instanceof Date) return value;
	const normalized = value.replace(" ", "T");
	const hasZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(normalized);
	return new Date(hasZone ? normalized : `${normalized}Z`);
}

export async function loadCustomSessionData({
	userId,
	activeOrganizationId,
}: {
	userId: string;
	activeOrganizationId: string | null;
}): Promise<CustomSessionData> {
	const statuses = sql.join(
		ACTIVE_SUBSCRIPTION_STATUSES.map((status) => sql`${status}`),
		sql`, `,
	);

	const result = await db.execute<CustomSessionRow>(sql`
		WITH memberships AS (
			SELECT id, organization_id, user_id, role, created_at
			FROM auth.members
			WHERE user_id = ${userId}::uuid
		),
		last_active AS (
			SELECT last_active_organization_id AS organization_id
			FROM auth.users WHERE id = ${userId}::uuid
		),
		active AS (
			SELECT COALESCE(
				(SELECT organization_id FROM memberships
				 WHERE organization_id = ${activeOrganizationId}::uuid LIMIT 1),
				(SELECT m.organization_id FROM memberships m, last_active l
				 WHERE m.organization_id = l.organization_id LIMIT 1),
				(SELECT organization_id FROM memberships
				 ORDER BY created_at DESC LIMIT 1)
			) AS organization_id
		)
		SELECT
			(SELECT COALESCE(json_agg(json_build_object(
					'id', id,
					'organizationId', organization_id,
					'userId', user_id,
					'role', role,
					'createdAt', created_at
				) ORDER BY created_at DESC), '[]'::json)
			 FROM memberships) AS memberships,
			(SELECT organization_id FROM active) AS active_organization_id,
			(SELECT s.plan FROM subscriptions s, active a
			 WHERE s.reference_id = a.organization_id
			   AND s.status IN (${statuses})
			 LIMIT 1) AS plan,
			u.last_active_organization_id,
			u.onboarded_at,
			u.deletion_requested_at
		FROM auth.users u
		WHERE u.id = ${userId}::uuid
	`);

	const row = result.rows[0];
	if (!row) {
		return {
			memberships: [],
			planOrganizationId: null,
			plan: null,
			lastActiveOrganizationId: null,
			onboardedAt: null,
			deletionRequestedAt: null,
		};
	}

	return {
		memberships: (row.memberships ?? []).map((member) => ({
			id: member.id,
			organizationId: member.organizationId,
			userId: member.userId,
			role: member.role,
			createdAt: toDate(member.createdAt) ?? new Date(0),
		})),
		planOrganizationId: row.active_organization_id,
		plan: row.plan,
		lastActiveOrganizationId: row.last_active_organization_id,
		onboardedAt: toDate(row.onboarded_at),
		deletionRequestedAt: toDate(row.deletion_requested_at),
	};
}
