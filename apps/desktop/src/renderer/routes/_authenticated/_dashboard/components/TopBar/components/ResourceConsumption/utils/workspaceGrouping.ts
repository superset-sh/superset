import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { SortOption, WorkspaceMetrics } from "../types";

export interface ProjectResourceGroup {
	projectId: string;
	projectName: string;
	cpu: number;
	memory: number;
	workspaces: WorkspaceMetrics[];
}

export function groupWorkspacesByProject(
	workspaces: WorkspaceMetrics[],
): ProjectResourceGroup[] {
	const projectMap = new Map<string, ProjectResourceGroup>();

	for (const workspace of workspaces) {
		const projectId = workspace.projectId || "unknown";
		const projectName =
			workspace.projectName ||
			i18n._(
				msg({
					message: "Unknown Project",
				}),
			);
		let group = projectMap.get(projectId);
		if (!group) {
			group = {
				projectId,
				projectName,
				cpu: 0,
				memory: 0,
				workspaces: [],
			};
			projectMap.set(projectId, group);
		}

		group.cpu += workspace.cpu;
		group.memory += workspace.memory;
		group.workspaces.push(workspace);
	}

	return [...projectMap.values()];
}

export function sortWorkspaces(
	workspaces: WorkspaceMetrics[],
	sortOption: SortOption,
	sidebarWorkspaceOrder: string[],
): WorkspaceMetrics[] {
	const sorted = [...workspaces];
	switch (sortOption) {
		case "memory":
			sorted.sort((a, b) => b.memory - a.memory);
			break;
		case "cpu":
			sorted.sort((a, b) => b.cpu - a.cpu);
			break;
		case "name":
			sorted.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
			break;
		case "sidebar": {
			const orderMap = new Map(
				sidebarWorkspaceOrder.map((id, index) => [id, index]),
			);
			sorted.sort(
				(a, b) =>
					(orderMap.get(a.workspaceId) ?? Number.MAX_SAFE_INTEGER) -
					(orderMap.get(b.workspaceId) ?? Number.MAX_SAFE_INTEGER),
			);
			break;
		}
	}
	return sorted;
}

export function sortProjectGroups(
	groups: ProjectResourceGroup[],
	sortOption: SortOption,
	sidebarProjectOrder: string[],
): ProjectResourceGroup[] {
	const sorted = [...groups];
	switch (sortOption) {
		case "memory":
			sorted.sort((a, b) => b.memory - a.memory);
			break;
		case "cpu":
			sorted.sort((a, b) => b.cpu - a.cpu);
			break;
		case "name":
			sorted.sort((a, b) => a.projectName.localeCompare(b.projectName));
			break;
		case "sidebar": {
			const orderMap = new Map(
				sidebarProjectOrder.map((id, index) => [id, index]),
			);
			sorted.sort(
				(a, b) =>
					(orderMap.get(a.projectId) ?? Number.MAX_SAFE_INTEGER) -
					(orderMap.get(b.projectId) ?? Number.MAX_SAFE_INTEGER),
			);
			break;
		}
	}
	return sorted;
}
