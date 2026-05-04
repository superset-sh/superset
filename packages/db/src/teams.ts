import { and, eq, isNull, sql } from "drizzle-orm";
import { dbWs } from "./client";
import { organizations } from "./schema/auth";
import { teamKeys, teamSequences, teams } from "./schema/schema";

type DbWsTransaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];
type Executor = typeof dbWs | DbWsTransaction;

/**
 * Returns the org's default (non-archived) team id. Creates one lazily on
 * first call: inserts the team, the initial team_keys row (key derived from
 * the org slug, fallback "TASK"), and the team_sequences row.
 */
export async function resolveDefaultTeam(
	organizationId: string,
	executor: Executor = dbWs,
): Promise<string> {
	const [existing] = await executor
		.select({ id: teams.id })
		.from(teams)
		.where(
			and(eq(teams.organizationId, organizationId), isNull(teams.archivedAt)),
		)
		.orderBy(teams.createdAt)
		.limit(1);

	if (existing) return existing.id;

	const [organization] = await executor
		.select({ slug: organizations.slug, name: organizations.name })
		.from(organizations)
		.where(eq(organizations.id, organizationId))
		.limit(1);

	if (!organization) {
		throw new Error(`Organization ${organizationId} not found`);
	}

	const key = deriveTeamKey(organization.slug);

	const [team] = await executor
		.insert(teams)
		.values({ organizationId, name: organization.name })
		.returning({ id: teams.id });

	if (!team) throw new Error("Failed to create default team");

	await executor
		.insert(teamKeys)
		.values({ teamId: team.id, organizationId, key });

	await executor
		.insert(teamSequences)
		.values({ teamId: team.id, lastNumber: 0 });

	return team.id;
}

/**
 * Atomically allocate the next number for a team. Single statement, single
 * round-trip. Surrounding tx rollback unwinds the counter — no gaps from
 * failed inserts.
 */
export async function allocateNextTaskNumber(
	teamId: string,
	executor: Executor = dbWs,
): Promise<number> {
	const [row] = await executor
		.insert(teamSequences)
		.values({ teamId, lastNumber: 1 })
		.onConflictDoUpdate({
			target: teamSequences.teamId,
			set: { lastNumber: sql`${teamSequences.lastNumber} + 1` },
		})
		.returning({ number: teamSequences.lastNumber });

	if (!row) throw new Error("Failed to allocate task number");
	return row.number;
}

/**
 * Reserve a contiguous range of numbers in one round-trip. Returns the first
 * number in the range; caller assigns `start + i` to each item.
 */
export async function allocateTaskNumberRange(
	teamId: string,
	count: number,
	executor: Executor = dbWs,
): Promise<number> {
	if (count <= 0) throw new Error("count must be positive");

	const [row] = await executor
		.insert(teamSequences)
		.values({ teamId, lastNumber: count })
		.onConflictDoUpdate({
			target: teamSequences.teamId,
			set: { lastNumber: sql`${teamSequences.lastNumber} + ${count}` },
		})
		.returning({ end: teamSequences.lastNumber });

	if (!row) throw new Error("Failed to allocate task number range");
	return row.end - count + 1;
}

export function deriveTeamKey(organizationSlug: string): string {
	const sanitized = organizationSlug.toUpperCase().replace(/[^A-Z0-9]/g, "");
	return sanitized.length > 0 ? sanitized : "TASK";
}
