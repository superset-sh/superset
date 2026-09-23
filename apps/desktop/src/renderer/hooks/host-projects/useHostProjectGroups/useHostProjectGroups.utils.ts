import type { HostProjectsQueryTarget } from "../useHostProjects/useHostProjects.utils";

export interface HostProjectGroupMember {
	id: string;
	groupId: string;
	projectId: string;
	position: number;
	folder: string;
	baseBranch: string | null;
}

export interface HostProjectGroup {
	id: string;
	hostId: string;
	name: string;
	icon: string | null;
	color: string | null;
	createdAt: number;
	updatedAt: number;
	members: HostProjectGroupMember[];
}

export const HOST_PROJECT_GROUPS_QUERY_PREFIX = [
	"host-service",
	"project-groups",
	"list",
] as const;

export function getHostProjectGroupsQueryKey(
	target: Pick<HostProjectsQueryTarget, "machineId" | "organizationId">,
) {
	return [
		...HOST_PROJECT_GROUPS_QUERY_PREFIX,
		target.organizationId,
		target.machineId,
	] as const;
}

export function findPrimaryMember(
	group: HostProjectGroup,
): HostProjectGroupMember | null {
	return group.members.find((member) => member.position === 0) ?? null;
}

/**
 * A repository adopted as another Project's first source folder is the
 * primary of both that Project and its own backfilled one, so the Project
 * that owns several folders wins — otherwise the container it names would
 * never be the one that renders or gets checked out. Host-side
 * `findGroupForPrimaryProject` resolves the same way.
 */
export function indexProjectGroupsByPrimaryProjectId(
	groups: HostProjectGroup[],
): Map<string, HostProjectGroup> {
	const byProjectId = new Map<string, HostProjectGroup>();
	for (const group of groups) {
		const primary = findPrimaryMember(group);
		if (!primary) continue;
		const claimed = byProjectId.get(primary.projectId);
		if (claimed && claimed.members.length >= group.members.length) continue;
		byProjectId.set(primary.projectId, group);
	}
	return byProjectId;
}

export function collectSourceFolderOnlyProjectIds(
	groups: HostProjectGroup[],
): Set<string> {
	const primaryProjectIds = new Set<string>();
	const memberProjectIds = new Set<string>();
	for (const group of groups) {
		for (const member of group.members) {
			memberProjectIds.add(member.projectId);
			if (member.position === 0) primaryProjectIds.add(member.projectId);
		}
	}
	for (const projectId of primaryProjectIds) memberProjectIds.delete(projectId);
	return memberProjectIds;
}

export function findProjectGroupForProject(
	groups: HostProjectGroup[],
	projectId: string,
): HostProjectGroup | null {
	return (
		indexProjectGroupsByPrimaryProjectId(groups).get(projectId) ??
		groups.find((group) =>
			group.members.some((member) => member.projectId === projectId),
		) ??
		null
	);
}
