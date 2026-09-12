export type HostAccessRow = {
	hostId: string;
	userId: string;
	role: "owner" | "member";
};

/**
 * Hosts that would be left with no owner who is still in the organization
 * once `leavingUserId` is gone. Owner rows held by users who already left the
 * org do not count as keeping a host alive.
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
	const owned = new Set(
		access
			.filter((row) => row.userId === leavingUserId && row.role === "owner")
			.map((row) => row.hostId),
	);
	return [...owned].filter((hostId) => !keptOwners.has(hostId));
}
