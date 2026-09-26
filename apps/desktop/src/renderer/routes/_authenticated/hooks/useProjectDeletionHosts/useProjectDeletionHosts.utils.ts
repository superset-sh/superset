interface HostMembership {
	hostId: string;
	userId: string;
	role: string;
}

export function selectProjectDeletionHosts({
	hostIds,
	userId,
	isOrganizationOwner,
	memberships,
}: {
	hostIds: string[];
	userId: string | undefined;
	isOrganizationOwner: boolean;
	memberships: HostMembership[];
}): string[] {
	if (!userId) return [];
	if (isOrganizationOwner) return hostIds;
	const ownedHostIds = new Set(
		memberships
			.filter((member) => member.userId === userId && member.role === "owner")
			.map((member) => member.hostId),
	);
	return hostIds.filter((hostId) => ownedHostIds.has(hostId));
}
