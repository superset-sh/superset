export type HostAccessRow = {
	hostId: string;
	userId: string;
	role: "owner" | "member";
};

/**
 * Hosts the leaver can reach that would be left with no owner who is still in
 * the organization once `leavingUserId` is gone. Owner rows held by users who
 * already left the org do not count as keeping a host alive, so a host whose
 * owner departed before this cleanup existed is swept the next time one of
 * its members leaves.
 */
export function orphanedHostIds(
	access: readonly HostAccessRow[],
	leavingUserId: string,
	remainingMemberUserIds: ReadonlySet<string>,
): string[] {
	const keptOwners = new Set(
		access
			.filter(
				(row) =>
					row.role === "owner" &&
					row.userId !== leavingUserId &&
					remainingMemberUserIds.has(row.userId),
			)
			.map((row) => row.hostId),
	);
	const reachable = new Set(
		access
			.filter((row) => row.userId === leavingUserId)
			.map((row) => row.hostId),
	);
	return [...reachable].filter((hostId) => !keptOwners.has(hostId));
}
