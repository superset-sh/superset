import type { EnrichedPort } from "shared/types";

export interface WorkspacePortGroup {
	workspaceId: string;
	workspaceName: string;
	ports: EnrichedPort[];
}

/**
 * Build a mapping of workspace IDs to their display names.
 */
export function buildWorkspaceNames(
	allWorkspaces: { id: string; name: string }[] | undefined,
): Record<string, string> {
	if (!allWorkspaces) return {};
	return allWorkspaces.reduce(
		(acc, ws) => {
			acc[ws.id] = ws.name;
			return acc;
		},
		{} as Record<string, string>,
	);
}

/**
 * Group detected ports by workspace and attach workspace names.
 * Ports within each group are sorted by port number; groups are sorted by workspace name.
 */
export function buildWorkspacePortGroups(
	ports: EnrichedPort[],
	workspaceNames: Record<string, string>,
): WorkspacePortGroup[] {
	const groupMap = new Map<string, EnrichedPort[]>();

	for (const port of ports) {
		const existing = groupMap.get(port.workspaceId);
		if (existing) {
			existing.push(port);
		} else {
			groupMap.set(port.workspaceId, [port]);
		}
	}

	const groups: WorkspacePortGroup[] = [];
	for (const [workspaceId, wsPorts] of groupMap) {
		groups.push({
			workspaceId,
			workspaceName: workspaceNames[workspaceId] || "Unknown",
			ports: wsPorts.sort((a, b) => a.port - b.port),
		});
	}

	return groups.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
}
