import { inheritedProjectIconUrl } from "renderer/hooks/host-projects/useGroupedProjects";
import {
	collectSourceFolderOnlyProjectIds,
	type HostProjectGroup,
	indexProjectGroupsByPrimaryProjectId,
} from "renderer/hooks/host-projects/useHostProjectGroups/useHostProjectGroups.utils";

export interface ProjectSettingsRowInput {
	id: string;
	name: string;
	iconUrl: string | null;
	color: string | null;
}

export type ProjectSettingsRow = ProjectSettingsRowInput & {
	kind: "project" | "folder";
	/** Set when the row opens a Project page rather than a repository page. */
	groupId: string | null;
	/** The Project a folder row belongs to; a repo can be a folder of several. */
	parentGroupId: string | null;
	depth: 0 | 1;
};

export function buildProjectSettingsRows(
	projects: ProjectSettingsRowInput[],
	groups: HostProjectGroup[],
): ProjectSettingsRow[] {
	const groupByPrimaryProjectId = indexProjectGroupsByPrimaryProjectId(groups);
	const sourceFolderOnlyProjectIds = collectSourceFolderOnlyProjectIds(groups);
	const projectsById = new Map(
		projects.map((project) => [project.id, project]),
	);
	const iconUrlByProjectId = new Map(
		projects.map((project) => [project.id, project.iconUrl]),
	);

	return projects.flatMap((project): ProjectSettingsRow[] => {
		if (sourceFolderOnlyProjectIds.has(project.id)) return [];
		const group = groupByPrimaryProjectId.get(project.id);
		if (!group || group.members.length < 2) {
			return [
				{
					...project,
					// A rename writes the group's name, so it is the one the
					// dashboard sidebar and the project page already show.
					name: group?.name ?? project.name,
					kind: "project",
					groupId: null,
					parentGroupId: null,
					depth: 0,
				},
			];
		}
		return [
			{
				...project,
				name: group.name,
				iconUrl:
					project.iconUrl ?? inheritedProjectIconUrl(group, iconUrlByProjectId),
				kind: "project",
				groupId: group.id,
				parentGroupId: null,
				depth: 0,
			},
			...group.members.flatMap((member): ProjectSettingsRow[] => {
				const memberProject = projectsById.get(member.projectId);
				if (!memberProject) return [];
				return [
					{
						...memberProject,
						name: member.folder,
						kind: "folder",
						groupId: null,
						parentGroupId: group.id,
						depth: 1,
					},
				];
			}),
		];
	});
}
