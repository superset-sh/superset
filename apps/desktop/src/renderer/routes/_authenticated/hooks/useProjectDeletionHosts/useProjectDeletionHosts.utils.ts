interface HostMembership {
	hostId: string;
	userId: string;
	role: string;
}

interface ProjectWorkspace {
	projectId: string | null;
	hostId: string;
	createdByUserId: string | null;
	archivedAt?: number | null;
}

export interface ProjectDeletionHostAccess {
	hostId: string;
	canDelete: boolean;
	inUseByOthers: boolean;
	otherUsersWorkspaceCount: number;
}

export function resolveProjectDeletionAccess({
	projectId,
	hostIds,
	creatorByHostId,
	userId,
	isOrganizationOwner,
	memberships,
	workspaces,
}: {
	projectId: string;
	hostIds: string[];
	creatorByHostId: Record<string, string | null>;
	userId: string | undefined;
	isOrganizationOwner: boolean;
	memberships: HostMembership[];
	workspaces: ProjectWorkspace[];
}): ProjectDeletionHostAccess[] {
	const ownedHostIds = new Set(
		memberships
			.filter((member) => member.userId === userId && member.role === "owner")
			.map((member) => member.hostId),
	);
	return hostIds.map((hostId) => {
		const otherUsersWorkspaceCount = workspaces.filter(
			(workspace) =>
				workspace.projectId === projectId &&
				workspace.hostId === hostId &&
				!workspace.archivedAt &&
				workspace.createdByUserId !== userId,
		).length;
		const isOwner = isOrganizationOwner || ownedHostIds.has(hostId);
		const isCreator = !!userId && creatorByHostId[hostId] === userId;
		const inUseByOthers = otherUsersWorkspaceCount > 0;
		return {
			hostId,
			canDelete: !!userId && (isOwner || (isCreator && !inUseByOthers)),
			inUseByOthers: !isOwner && isCreator && inUseByOthers,
			otherUsersWorkspaceCount,
		};
	});
}
