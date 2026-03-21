import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const CURRENT_PROJECT_GROUP_ID = "current";
export const UNGROUPED_PROJECT_GROUP_ID = "__ungrouped__";

export interface ProjectGroupItem {
	id: string;
	name: string;
	order: number;
	isCollapsed: boolean;
}

interface ProjectGroupsState {
	groups: ProjectGroupItem[];
	projectAssignments: Record<string, string | null | undefined>;

	createGroup: (name?: string) => string;
	renameGroup: (groupId: string, name: string) => void;
	deleteGroup: (groupId: string) => void;
	toggleGroupCollapsed: (groupId: string) => void;
	setProjectGroup: (projectId: string, groupId: string | null) => void;
}

const DEFAULT_GROUPS: ProjectGroupItem[] = [
	{
		id: CURRENT_PROJECT_GROUP_ID,
		name: "Current",
		order: 0,
		isCollapsed: false,
	},
];

function getNextGroupName(groups: ProjectGroupItem[]): string {
	const baseName = "New Group";
	const names = new Set(groups.map((group) => group.name));
	if (!names.has(baseName)) {
		return baseName;
	}

	let suffix = 2;
	while (names.has(`${baseName} ${suffix}`)) {
		suffix += 1;
	}

	return `${baseName} ${suffix}`;
}

function ensureDefaultGroups(groups: ProjectGroupItem[]): ProjectGroupItem[] {
	if (groups.some((group) => group.id === CURRENT_PROJECT_GROUP_ID)) {
		return [...groups].sort((a, b) => a.order - b.order);
	}

	return [...DEFAULT_GROUPS, ...groups].map((group, index) => ({
		...group,
		order: index,
	}));
}

export const useProjectGroupsStore = create<ProjectGroupsState>()(
	devtools(
		persist(
			(set, get) => ({
				groups: DEFAULT_GROUPS,
				projectAssignments: {},

				createGroup: (name) => {
					const groups = ensureDefaultGroups(get().groups);
					const id = crypto.randomUUID();
					const nextGroup: ProjectGroupItem = {
						id,
						name: name?.trim() || getNextGroupName(groups),
						order: groups.length,
						isCollapsed: false,
					};

					set({ groups: [...groups, nextGroup] });
					return id;
				},

				renameGroup: (groupId, name) => {
					const trimmedName = name.trim();
					if (!trimmedName) return;

					set((state) => ({
						groups: ensureDefaultGroups(state.groups).map((group) =>
							group.id === groupId ? { ...group, name: trimmedName } : group,
						),
					}));
				},

				deleteGroup: (groupId) => {
					if (groupId === CURRENT_PROJECT_GROUP_ID) return;

					set((state) => {
						const nextAssignments = { ...state.projectAssignments };
						for (const [projectId, assignedGroupId] of Object.entries(nextAssignments)) {
							if (assignedGroupId === groupId) {
								nextAssignments[projectId] = null;
							}
						}

						return {
							groups: ensureDefaultGroups(state.groups)
								.filter((group) => group.id !== groupId)
								.map((group, index) => ({ ...group, order: index })),
							projectAssignments: nextAssignments,
						};
					});
				},

				toggleGroupCollapsed: (groupId) => {
					set((state) => ({
						groups: ensureDefaultGroups(state.groups).map((group) =>
							group.id === groupId
								? { ...group, isCollapsed: !group.isCollapsed }
								: group,
						),
					}));
				},

				setProjectGroup: (projectId, groupId) => {
					set((state) => {
						const nextAssignments = {
							...state.projectAssignments,
							[projectId]: groupId,
						};
						return {
							projectAssignments: nextAssignments,
						};
					});
				},

			}),
			{
				name: "project-groups-store",
				version: 2,
				migrate: (persistedState) => {
					const state = persistedState as Partial<ProjectGroupsState> | undefined;
					return {
						groups: ensureDefaultGroups(state?.groups ?? DEFAULT_GROUPS),
						projectAssignments: Object.fromEntries(
							Object.entries(state?.projectAssignments ?? {}).map(
								([projectId, groupId]) => [
									projectId,
									groupId === null ? CURRENT_PROJECT_GROUP_ID : groupId,
								],
							),
						),
					};
				},
			},
		),
		{ name: "ProjectGroupsStore" },
	),
);
