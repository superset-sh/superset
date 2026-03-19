import {
	CURRENT_PROJECT_GROUP_ID,
	UNGROUPED_PROJECT_GROUP_ID,
	type ProjectGroupItem,
} from "renderer/stores/project-groups-state";

interface SidebarProjectLike {
	project: {
		id: string;
	};
	workspaces: Array<unknown>;
	sections?: Array<{
		workspaces: Array<unknown>;
	}>;
}

export interface GroupedProjectBucket<TProject extends SidebarProjectLike> {
	id: string;
	name: string;
	isCollapsed: boolean;
	projects: TProject[];
	projectCount: number;
	workspaceCount: number;
	isDefault: boolean;
}

export function groupProjectsBySidebarGroups<TProject extends SidebarProjectLike>({
	projectGroups,
	projectAssignments,
	projects,
}: {
	projectGroups: ProjectGroupItem[];
	projectAssignments: Record<string, string | null | undefined>;
	projects: TProject[];
}): GroupedProjectBucket<TProject>[] {
	const orderedGroups = [...projectGroups].sort((a, b) => a.order - b.order);
	const buckets = new Map<string, GroupedProjectBucket<TProject>>(
		orderedGroups.map((group) => [
			group.id,
			{
				id: group.id,
				name: group.name,
				isCollapsed: group.isCollapsed,
				projects: [],
				projectCount: 0,
				workspaceCount: 0,
				isDefault: group.id === CURRENT_PROJECT_GROUP_ID,
			},
		]),
	);

	buckets.set(UNGROUPED_PROJECT_GROUP_ID, {
		id: UNGROUPED_PROJECT_GROUP_ID,
		name: "Other Projects",
		isCollapsed: false,
		projects: [],
		projectCount: 0,
		workspaceCount: 0,
		isDefault: false,
	});

	for (const project of projects) {
		const assignedGroupId = projectAssignments[project.project.id];
		const bucket =
			assignedGroupId === UNGROUPED_PROJECT_GROUP_ID
				? buckets.get(UNGROUPED_PROJECT_GROUP_ID)
				: buckets.get(assignedGroupId ?? CURRENT_PROJECT_GROUP_ID) ??
					buckets.get(CURRENT_PROJECT_GROUP_ID) ??
					buckets.get(UNGROUPED_PROJECT_GROUP_ID);
		if (!bucket) continue;

		const workspaceCount =
			project.workspaces.length +
			(project.sections ?? []).reduce(
				(sum, section) => sum + section.workspaces.length,
				0,
			);

		bucket.projects.push(project);
		bucket.projectCount += 1;
		bucket.workspaceCount += workspaceCount;
	}

	return [...orderedGroups.map((group) => buckets.get(group.id)).filter(Boolean), buckets.get(UNGROUPED_PROJECT_GROUP_ID)]
		.filter((bucket): bucket is GroupedProjectBucket<TProject> => Boolean(bucket))
		.filter((bucket) => bucket.id !== UNGROUPED_PROJECT_GROUP_ID || bucket.projects.length > 0);
}
