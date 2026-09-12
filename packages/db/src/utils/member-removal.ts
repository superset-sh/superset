import { and, eq, inArray, ne } from "drizzle-orm";
import { db, dbWs } from "../client";
import { members } from "../schema/auth";
import { automations, v2Hosts, v2UsersHosts } from "../schema/schema";
import { orphanedHostIds } from "./member-removal-orphans";

export type MemberRemovalEffects = {
	automations: { id: string; name: string }[];
	hosts: { machineId: string; name: string }[];
};

type MemberRef = { userId: string; organizationId: string };

type Reader = Pick<typeof db, "select">;

/**
 * What leaves the organization with this member: the automations they own
 * (runs dispatch as the owner, so nobody else can keep them alive) and the
 * hosts that would have no owner left. Membership on other people's hosts is
 * dropped silently since it is only an access row.
 */
async function loadEffects(
	reader: Reader,
	{ userId, organizationId }: MemberRef,
): Promise<MemberRemovalEffects> {
	const owned = await reader
		.select({ id: automations.id, name: automations.name })
		.from(automations)
		.where(
			and(
				eq(automations.organizationId, organizationId),
				eq(automations.ownerUserId, userId),
			),
		);
	const access = await reader
		.select({
			hostId: v2UsersHosts.hostId,
			userId: v2UsersHosts.userId,
			role: v2UsersHosts.role,
		})
		.from(v2UsersHosts)
		.where(eq(v2UsersHosts.organizationId, organizationId));
	const remaining = await reader
		.select({ userId: members.userId })
		.from(members)
		.where(
			and(
				eq(members.organizationId, organizationId),
				ne(members.userId, userId),
			),
		);
	const orphaned = orphanedHostIds(
		access,
		userId,
		new Set(remaining.map((row) => row.userId)),
	);
	const hosts =
		orphaned.length === 0
			? []
			: await reader
					.select({ machineId: v2Hosts.machineId, name: v2Hosts.name })
					.from(v2Hosts)
					.where(
						and(
							eq(v2Hosts.organizationId, organizationId),
							inArray(v2Hosts.machineId, orphaned),
						),
					);
	return { automations: owned, hosts };
}

export function findMemberRemovalEffects(
	member: MemberRef,
): Promise<MemberRemovalEffects> {
	return loadEffects(db, member);
}

/** Runs after the membership row is gone; deleting hosts cascades their workspaces and access rows. */
export function cleanupRemovedMember(
	member: MemberRef,
): Promise<MemberRemovalEffects> {
	return dbWs.transaction(async (tx) => {
		const effects = await loadEffects(tx, member);
		if (effects.automations.length > 0) {
			await tx.delete(automations).where(
				inArray(
					automations.id,
					effects.automations.map((row) => row.id),
				),
			);
		}
		if (effects.hosts.length > 0) {
			await tx.delete(v2Hosts).where(
				and(
					eq(v2Hosts.organizationId, member.organizationId),
					inArray(
						v2Hosts.machineId,
						effects.hosts.map((row) => row.machineId),
					),
				),
			);
		}
		await tx
			.delete(v2UsersHosts)
			.where(
				and(
					eq(v2UsersHosts.organizationId, member.organizationId),
					eq(v2UsersHosts.userId, member.userId),
				),
			);
		return effects;
	});
}
