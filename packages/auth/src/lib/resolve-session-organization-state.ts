import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import type { SelectMember } from "@superset/db/schema/auth";
import * as authSchema from "@superset/db/schema/auth";
import { and, desc, eq, sql } from "drizzle-orm";

export type SessionOrganizationContext = {
	id?: string;
	activeOrganizationId?: string | null;
};

export interface ResolveSessionOrganizationDeps {
	listMemberships: (userId: string) => Promise<SelectMember[]>;
	/** Only consulted when the session itself has no usable organization, so
	 * the common path never pays for it. */
	getLastActiveOrganization: (userId: string) => Promise<string | null>;
	updateSessionActiveOrganization: (input: {
		sessionId: string;
		previousActiveOrganizationId: string | null;
		nextActiveOrganizationId: string | null;
	}) => Promise<boolean>;
	getSessionActiveOrganization: (sessionId: string) => Promise<string | null>;
}

const defaultResolveSessionOrganizationDeps: ResolveSessionOrganizationDeps = {
	listMemberships: (userId) =>
		db.query.members.findMany({
			where: eq(members.userId, userId),
			orderBy: desc(members.createdAt),
		}),
	getLastActiveOrganization: async (userId) => {
		const [userRow] = await db
			.select({
				lastActiveOrganizationId: authSchema.users.lastActiveOrganizationId,
			})
			.from(authSchema.users)
			.where(eq(authSchema.users.id, userId))
			.limit(1);

		return userRow?.lastActiveOrganizationId ?? null;
	},
	updateSessionActiveOrganization: async ({
		sessionId,
		previousActiveOrganizationId,
		nextActiveOrganizationId,
	}) => {
		const updatedSessions = await db
			.update(authSchema.sessions)
			.set({ activeOrganizationId: nextActiveOrganizationId })
			.where(
				and(
					eq(authSchema.sessions.id, sessionId),
					sql`${authSchema.sessions.activeOrganizationId} is not distinct from ${previousActiveOrganizationId}`,
				),
			)
			.returning({ id: authSchema.sessions.id });

		return updatedSessions.length > 0;
	},
	getSessionActiveOrganization: async (sessionId) => {
		const [sessionRow] = await db
			.select({
				activeOrganizationId: authSchema.sessions.activeOrganizationId,
			})
			.from(authSchema.sessions)
			.where(eq(authSchema.sessions.id, sessionId))
			.limit(1);

		return sessionRow?.activeOrganizationId ?? null;
	},
};

export async function resolveSessionOrganizationState(
	{
		userId,
		session,
	}: {
		userId?: string | null;
		session?: SessionOrganizationContext | null;
	},
	overrides: Partial<ResolveSessionOrganizationDeps> = {},
) {
	const deps = { ...defaultResolveSessionOrganizationDeps, ...overrides };
	const previousActiveOrganizationId = session?.activeOrganizationId ?? null;
	let activeOrganizationId = previousActiveOrganizationId;
	if (!userId) {
		return {
			activeOrganizationId,
			allMemberships: [],
			membership: undefined,
		};
	}

	const allMemberships = await deps.listMemberships(userId);

	// Session first: it is the only thing that knows about an organization this
	// session was explicitly switched to. Then the user's last switch, so a new
	// session resumes where the last one left off. The newest membership is the
	// last resort, for a user who has never switched at all — reaching it for
	// anyone else is what silently moved people between organizations.
	let nextMembership = previousActiveOrganizationId
		? allMemberships.find(
				(item) => item.organizationId === previousActiveOrganizationId,
			)
		: undefined;

	if (!nextMembership) {
		const lastActiveOrganizationId =
			await deps.getLastActiveOrganization(userId);
		nextMembership =
			(lastActiveOrganizationId
				? allMemberships.find(
						(item) => item.organizationId === lastActiveOrganizationId,
					)
				: undefined) ?? allMemberships[0];
	}

	const nextActiveOrganizationId = nextMembership?.organizationId ?? null;
	if (nextActiveOrganizationId !== previousActiveOrganizationId) {
		if (session?.id) {
			const updated = await deps.updateSessionActiveOrganization({
				sessionId: session.id,
				previousActiveOrganizationId,
				nextActiveOrganizationId,
			});

			if (updated) {
				activeOrganizationId = nextActiveOrganizationId;
			} else {
				// Another request won the race to update this session; prefer
				// the latest persisted active org instead of clobbering it.
				activeOrganizationId = await deps.getSessionActiveOrganization(
					session.id,
				);
			}
		} else {
			activeOrganizationId = nextActiveOrganizationId;
		}
	}

	const membership =
		(activeOrganizationId
			? allMemberships.find(
					(item) => item.organizationId === activeOrganizationId,
				)
			: undefined) ?? (!activeOrganizationId ? allMemberships[0] : undefined);

	return {
		activeOrganizationId,
		allMemberships,
		membership,
	};
}
