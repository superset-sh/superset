import { db } from "@superset/db/client";
import {
	cloudWorkspaceShares,
	invitations,
	members,
	type PageShareRole,
	pageShares,
	teamMembers,
	teams,
	users,
} from "@superset/db/schema";
import {
	and,
	count,
	desc,
	eq,
	gt,
	inArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { userError } from "../../i18n-error";
import type { GranteeRef } from "./schema";

type ShareTable = typeof cloudWorkspaceShares | typeof pageShares;

export type ShareTarget =
	| { kind: "cloudWorkspace"; id: string }
	| { kind: "page"; id: string };

export type Grantee = { role: PageShareRole | null; sharedAt: Date } & (
	| {
			kind: "user";
			userId: string;
			name: string;
			email: string;
			image: string | null;
	  }
	| { kind: "team"; teamId: string; name: string; memberCount: number }
	| { kind: "invitation"; invitationId: string; email: string }
);

/** Rows of `table` that grant to `userId`, directly or through a team they are in now. */
export function grantsTo(table: ShareTable, userId: string): SQL {
	return or(
		eq(table.userId, userId),
		inArray(
			table.teamId,
			db
				.select({ id: teamMembers.teamId })
				.from(teamMembers)
				.where(eq(teamMembers.userId, userId)),
		),
	) as SQL;
}

function matchesGrantee(table: ShareTable, grantee: GranteeRef): SQL {
	switch (grantee.kind) {
		case "user":
			return eq(table.userId, grantee.userId);
		case "team":
			return eq(table.teamId, grantee.teamId);
		case "invitation":
			return eq(table.invitationId, grantee.invitationId);
	}
}

const pendingInvitation = () =>
	and(eq(invitations.status, "pending"), gt(invitations.expiresAt, sql`now()`));

async function shareRows(target: ShareTarget) {
	const grant = (table: ShareTable) => ({
		userId: table.userId,
		teamId: table.teamId,
		invitationId: table.invitationId,
		createdAt: table.createdAt,
	});
	if (target.kind === "page") {
		return db
			.select({ ...grant(pageShares), role: pageShares.role })
			.from(pageShares)
			.where(eq(pageShares.pageId, target.id))
			.orderBy(desc(pageShares.createdAt));
	}
	return db
		.select({
			...grant(cloudWorkspaceShares),
			role: sql<PageShareRole | null>`null`,
		})
		.from(cloudWorkspaceShares)
		.where(eq(cloudWorkspaceShares.cloudWorkspaceId, target.id))
		.orderBy(desc(cloudWorkspaceShares.createdAt));
}

/** Newest first. Invitations that were cancelled or expired are left out: they grant nothing. */
export async function listGrantees(target: ShareTarget): Promise<Grantee[]> {
	const rows = await shareRows(target);
	const ids = (key: "userId" | "teamId" | "invitationId") =>
		rows.flatMap((row) => (row[key] ? [row[key]] : []));

	const userIds = ids("userId");
	const teamIds = ids("teamId");
	const invitationIds = ids("invitationId");

	const [userRows, teamRows, invitationRows] = await Promise.all([
		userIds.length
			? db
					.select({
						id: users.id,
						name: users.name,
						email: users.email,
						image: users.image,
					})
					.from(users)
					.where(inArray(users.id, userIds))
			: [],
		teamIds.length
			? db
					.select({
						id: teams.id,
						name: teams.name,
						memberCount: count(teamMembers.id),
					})
					.from(teams)
					.leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
					.where(inArray(teams.id, teamIds))
					.groupBy(teams.id, teams.name)
			: [],
		invitationIds.length
			? db
					.select({ id: invitations.id, email: invitations.email })
					.from(invitations)
					.where(
						and(inArray(invitations.id, invitationIds), pendingInvitation()),
					)
			: [],
	]);

	const usersById = new Map(userRows.map((row) => [row.id, row]));
	const teamsById = new Map(teamRows.map((row) => [row.id, row]));
	const invitationsById = new Map(invitationRows.map((row) => [row.id, row]));

	return rows.flatMap((row): Grantee[] => {
		const shared = { role: row.role, sharedAt: row.createdAt };
		if (row.userId) {
			const user = usersById.get(row.userId);
			return user
				? [{ ...shared, kind: "user", userId: user.id, ...withoutId(user) }]
				: [];
		}
		if (row.teamId) {
			const team = teamsById.get(row.teamId);
			return team
				? [
						{
							...shared,
							kind: "team",
							teamId: team.id,
							name: team.name,
							memberCount: team.memberCount,
						},
					]
				: [];
		}
		if (row.invitationId) {
			const invitation = invitationsById.get(row.invitationId);
			return invitation
				? [
						{
							...shared,
							kind: "invitation",
							invitationId: invitation.id,
							email: invitation.email,
						},
					]
				: [];
		}
		return [];
	});
}

function withoutId<T extends { id: string }>({ id: _id, ...rest }: T) {
	return rest;
}

/**
 * Every grantee must belong to the resource's organization: a member, one of
 * its teams, or one of its pending invitations. The owner is dropped, since
 * they always have access.
 */
export async function validateGrantees({
	organizationId,
	ownerId,
	grantees,
}: {
	organizationId: string;
	ownerId: string | null;
	grantees: GranteeRef[];
}): Promise<GranteeRef[]> {
	const wanted = grantees.filter(
		(grantee) => !(grantee.kind === "user" && grantee.userId === ownerId),
	);
	const of = <K extends GranteeRef["kind"]>(kind: K) =>
		wanted.filter(
			(g): g is Extract<GranteeRef, { kind: K }> => g.kind === kind,
		);

	const userIds = of("user").map((g) => g.userId);
	const teamIds = of("team").map((g) => g.teamId);
	const invitationIds = of("invitation").map((g) => g.invitationId);

	const [memberRows, teamRows, invitationRows] = await Promise.all([
		userIds.length
			? db
					.select({ id: members.userId })
					.from(members)
					.where(
						and(
							eq(members.organizationId, organizationId),
							inArray(members.userId, userIds),
						),
					)
			: [],
		teamIds.length
			? db
					.select({ id: teams.id })
					.from(teams)
					.where(
						and(
							eq(teams.organizationId, organizationId),
							inArray(teams.id, teamIds),
						),
					)
			: [],
		invitationIds.length
			? db
					.select({ id: invitations.id })
					.from(invitations)
					.where(
						and(
							eq(invitations.organizationId, organizationId),
							inArray(invitations.id, invitationIds),
							pendingInvitation(),
						),
					)
			: [],
	]);

	if (
		new Set(memberRows.map((row) => row.id)).size !== new Set(userIds).size ||
		new Set(teamRows.map((row) => row.id)).size !== new Set(teamIds).size
	) {
		throw userError({
			code: "BAD_REQUEST",
			message: "You can only share with people and teams in this organization",
			i18nKey: "serverError.sharing.notInOrganization",
		});
	}
	if (
		new Set(invitationRows.map((row) => row.id)).size !==
		new Set(invitationIds).size
	) {
		throw userError({
			code: "BAD_REQUEST",
			message: "That invitation is no longer pending",
			i18nKey: "serverError.sharing.invitationNotPending",
		});
	}
	return wanted;
}

/** Already-shared grantees are skipped. Returns the ones that were added. */
export async function addShares({
	target,
	grantees,
	sharedByUserId,
	role,
}: {
	target: ShareTarget;
	grantees: GranteeRef[];
	sharedByUserId: string;
	role?: PageShareRole;
}): Promise<GranteeRef[]> {
	if (!grantees.length) return [];
	const values = grantees.map((grantee) => ({
		userId: grantee.kind === "user" ? grantee.userId : null,
		teamId: grantee.kind === "team" ? grantee.teamId : null,
		invitationId: grantee.kind === "invitation" ? grantee.invitationId : null,
		sharedByUserId,
	}));
	const returning = (table: ShareTable) => ({
		userId: table.userId,
		teamId: table.teamId,
		invitationId: table.invitationId,
	});
	const inserted =
		target.kind === "page"
			? await db
					.insert(pageShares)
					.values(
						values.map((value) => ({
							...value,
							pageId: target.id,
							role: role ?? "comment",
						})),
					)
					.onConflictDoNothing()
					.returning(returning(pageShares))
			: await db
					.insert(cloudWorkspaceShares)
					.values(
						values.map((value) => ({ ...value, cloudWorkspaceId: target.id })),
					)
					.onConflictDoNothing()
					.returning(returning(cloudWorkspaceShares));

	return inserted.flatMap((row): GranteeRef[] => {
		if (row.userId) return [{ kind: "user", userId: row.userId }];
		if (row.teamId) return [{ kind: "team", teamId: row.teamId }];
		if (row.invitationId) {
			return [{ kind: "invitation", invitationId: row.invitationId }];
		}
		return [];
	});
}

/** Returns false when there was nothing to remove. */
export async function removeShare(
	target: ShareTarget,
	grantee: GranteeRef,
): Promise<boolean> {
	const removed =
		target.kind === "page"
			? await db
					.delete(pageShares)
					.where(
						and(
							eq(pageShares.pageId, target.id),
							matchesGrantee(pageShares, grantee),
						),
					)
					.returning({ id: pageShares.id })
			: await db
					.delete(cloudWorkspaceShares)
					.where(
						and(
							eq(cloudWorkspaceShares.cloudWorkspaceId, target.id),
							matchesGrantee(cloudWorkspaceShares, grantee),
						),
					)
					.returning({ id: cloudWorkspaceShares.id });
	return removed.length > 0;
}

export async function setPageShareRole(
	pageId: string,
	grantee: GranteeRef,
	role: PageShareRole,
): Promise<boolean> {
	const updated = await db
		.update(pageShares)
		.set({ role })
		.where(
			and(eq(pageShares.pageId, pageId), matchesGrantee(pageShares, grantee)),
		)
		.returning({ id: pageShares.id });
	return updated.length > 0;
}

/** The strongest role any of `userId`'s grants give on a page, or null when none do. */
export async function pageShareRoleFor(
	pageId: string,
	userId: string,
): Promise<PageShareRole | null> {
	const rows = await db
		.select({ role: pageShares.role })
		.from(pageShares)
		.where(and(eq(pageShares.pageId, pageId), grantsTo(pageShares, userId)));
	if (rows.some((row) => row.role === "comment")) return "comment";
	return rows.length ? "view" : null;
}

export async function isCloudWorkspaceSharedWith(
	cloudWorkspaceId: string,
	userId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: cloudWorkspaceShares.id })
		.from(cloudWorkspaceShares)
		.where(
			and(
				eq(cloudWorkspaceShares.cloudWorkspaceId, cloudWorkspaceId),
				grantsTo(cloudWorkspaceShares, userId),
			),
		)
		.limit(1);
	return Boolean(row);
}

/** Who each grantee is, in the shape the activity log records. */
export async function activityTargets(grantees: GranteeRef[]) {
	const invitationIds = grantees.flatMap((g) =>
		g.kind === "invitation" ? [g.invitationId] : [],
	);
	const emails = new Map(
		invitationIds.length
			? (
					await db
						.select({ id: invitations.id, email: invitations.email })
						.from(invitations)
						.where(inArray(invitations.id, invitationIds))
				).map((row) => [row.id, row.email])
			: [],
	);
	return grantees.map((grantee) => ({
		targetUserId: grantee.kind === "user" ? grantee.userId : null,
		targetTeamId: grantee.kind === "team" ? grantee.teamId : null,
		targetEmail:
			grantee.kind === "invitation"
				? (emails.get(grantee.invitationId) ?? null)
				: null,
	}));
}
