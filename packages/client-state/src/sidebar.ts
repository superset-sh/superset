import type { SidebarCommand, SidebarStateSnapshot } from "./schema";

type TopLevelItem = {
	type: "workspace" | "group";
	id: string;
	tabOrder: number;
};

function compareTopLevel(left: TopLevelItem, right: TopLevelItem): number {
	return (
		left.tabOrder - right.tabOrder ||
		(left.type === right.type
			? left.id.localeCompare(right.id)
			: left.type === "group"
				? -1
				: 1)
	);
}

function topLevelItems(
	state: SidebarStateSnapshot,
	projectId: string,
	exclude: { workspaceId?: string; groupId?: string } = {},
): TopLevelItem[] {
	return [
		...state.workspaces
			.filter(
				(workspace) =>
					workspace.projectId === projectId &&
					!workspace.isHidden &&
					workspace.groupId === null &&
					workspace.id !== exclude.workspaceId,
			)
			.map((workspace) => ({
				type: "workspace" as const,
				id: workspace.id,
				tabOrder: workspace.tabOrder,
			})),
		...state.groups
			.filter(
				(group) =>
					group.projectId === projectId && group.id !== exclude.groupId,
			)
			.map((group) => ({
				type: "group" as const,
				id: group.id,
				tabOrder: group.tabOrder,
			})),
	].sort(compareTopLevel);
}

function writeTopLevelOrder(
	state: SidebarStateSnapshot,
	projectId: string,
	items: TopLevelItem[],
): void {
	items.forEach((item, index) => {
		if (item.type === "workspace") {
			const workspace = state.workspaces.find((entry) => entry.id === item.id);
			if (!workspace) return;
			workspace.projectId = projectId;
			workspace.groupId = null;
			workspace.tabOrder = index + 1;
			workspace.isHidden = false;
			return;
		}
		const group = state.groups.find((entry) => entry.id === item.id);
		if (group) group.tabOrder = index + 1;
	});
}

function nextOrder(items: Array<{ tabOrder: number }>): number {
	return (
		items.reduce((maximum, item) => Math.max(maximum, item.tabOrder), 0) + 1
	);
}

function ensureProject(state: SidebarStateSnapshot, projectId: string): void {
	if (state.projects.some((project) => project.id === projectId)) return;
	state.projects.push({
		id: projectId,
		tabOrder: nextOrder(state.projects),
		isCollapsed: false,
	});
}

function ensureWorkspace(
	state: SidebarStateSnapshot,
	workspaceId: string,
	projectId: string,
): (typeof state.workspaces)[number] {
	const existing = state.workspaces.find(
		(workspace) => workspace.id === workspaceId,
	);
	if (existing) {
		existing.projectId = projectId;
		existing.isHidden = false;
		return existing;
	}
	const workspace = {
		id: workspaceId,
		projectId,
		groupId: null,
		tabOrder: nextOrder(topLevelItems(state, projectId)),
		isHidden: false,
	};
	state.workspaces.push(workspace);
	return workspace;
}

function normalize(state: SidebarStateSnapshot): SidebarStateSnapshot {
	state.projects.sort(
		(left, right) =>
			left.tabOrder - right.tabOrder || left.id.localeCompare(right.id),
	);
	state.groups.sort(
		(left, right) =>
			left.projectId.localeCompare(right.projectId) ||
			left.tabOrder - right.tabOrder ||
			left.id.localeCompare(right.id),
	);
	state.workspaces.sort(
		(left, right) =>
			left.projectId.localeCompare(right.projectId) ||
			(left.groupId ?? "").localeCompare(right.groupId ?? "") ||
			left.tabOrder - right.tabOrder ||
			left.id.localeCompare(right.id),
	);
	return state;
}

export function applySidebarCommand(
	current: SidebarStateSnapshot,
	command: SidebarCommand,
): SidebarStateSnapshot {
	const state = structuredClone(current);
	if (command.action === "list") return normalize(state);

	switch (command.action) {
		case "create-group": {
			const name = command.name.trim();
			const existing = state.groups.find(
				(group) => group.id === command.groupId,
			);
			if (existing) {
				if (
					existing.projectId === command.projectId &&
					existing.name === name
				) {
					return normalize(state);
				}
				throw new Error(`Group already exists: ${command.groupId}`);
			}
			ensureProject(state, command.projectId);
			state.groups.push({
				id: command.groupId,
				projectId: command.projectId,
				name,
				tabOrder: nextOrder(topLevelItems(state, command.projectId)),
				isCollapsed: false,
				color: command.color ?? null,
			});
			break;
		}
		case "rename-group": {
			const group = state.groups.find((entry) => entry.id === command.groupId);
			if (!group) throw new Error(`Group not found: ${command.groupId}`);
			group.name = command.name.trim();
			break;
		}
		case "set-group-collapsed": {
			const group = state.groups.find((entry) => entry.id === command.groupId);
			if (!group) throw new Error(`Group not found: ${command.groupId}`);
			group.isCollapsed = command.collapsed;
			break;
		}
		case "move-workspace": {
			ensureProject(state, command.projectId);
			const workspace = ensureWorkspace(
				state,
				command.workspaceId,
				command.projectId,
			);
			if (command.groupId === null) {
				const items = topLevelItems(state, command.projectId, {
					workspaceId: command.workspaceId,
				});
				const firstGroup = items.findIndex((item) => item.type === "group");
				items.splice(firstGroup === -1 ? items.length : firstGroup, 0, {
					type: "workspace",
					id: workspace.id,
					tabOrder: 0,
				});
				writeTopLevelOrder(state, command.projectId, items);
				break;
			}
			const group = state.groups.find((entry) => entry.id === command.groupId);
			if (!group) throw new Error(`Group not found: ${command.groupId}`);
			if (group.projectId !== command.projectId) {
				throw new Error(
					"A workspace and group must belong to the same project",
				);
			}
			workspace.groupId = group.id;
			workspace.tabOrder = nextOrder(
				state.workspaces.filter(
					(entry) => entry.id !== workspace.id && entry.groupId === group.id,
				),
			);
			workspace.isHidden = false;
			break;
		}
		case "delete-group": {
			const group = state.groups.find((entry) => entry.id === command.groupId);
			if (!group) throw new Error(`Group not found: ${command.groupId}`);
			const items = topLevelItems(state, group.projectId, {
				groupId: group.id,
			});
			const firstGroup = items.findIndex((item) => item.type === "group");
			const insertionIndex = firstGroup === -1 ? items.length : firstGroup;
			const groupedWorkspaces = state.workspaces
				.filter(
					(workspace) =>
						workspace.projectId === group.projectId &&
						workspace.groupId === group.id &&
						!workspace.isHidden,
				)
				.sort((left, right) => left.tabOrder - right.tabOrder)
				.map((workspace) => ({
					type: "workspace" as const,
					id: workspace.id,
					tabOrder: 0,
				}));
			items.splice(insertionIndex, 0, ...groupedWorkspaces);
			writeTopLevelOrder(state, group.projectId, items);
			state.groups = state.groups.filter((entry) => entry.id !== group.id);
			break;
		}
		default: {
			const exhaustive: never = command;
			throw new Error(
				`Unsupported sidebar command: ${JSON.stringify(exhaustive)}`,
			);
		}
	}

	return normalize(state);
}
