export function getHostServiceOrganizationIdsToStart({
	activeOrganizationId,
	knownOrganizationIds,
}: {
	activeOrganizationId: string | null;
	knownOrganizationIds: readonly string[];
}): string[] {
	if (!activeOrganizationId) return [];

	const knownActiveOrganizationId = knownOrganizationIds.find(
		(organizationId) => organizationId === activeOrganizationId,
	);
	return [knownActiveOrganizationId ?? activeOrganizationId];
}
