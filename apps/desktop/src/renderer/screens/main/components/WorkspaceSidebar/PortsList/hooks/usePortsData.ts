import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { EnrichedPort } from "shared/types";

const PORTS_FALLBACK_REFETCH_INTERVAL_MS = 10_000;

export interface WorkspacePortGroup {
	workspaceId: string;
	workspaceName: string;
	ports: EnrichedPort[];
}

export function usePortsData() {
	const { data: allWorkspaces } = electronTrpc.workspaces.getAll.useQuery();

	const utils = electronTrpc.useUtils();

	const { data: detectedPorts } = electronTrpc.ports.getAll.useQuery(
		undefined,
		{
			// Keep a low-frequency safety net in case subscription events are missed.
			refetchInterval: PORTS_FALLBACK_REFETCH_INTERVAL_MS,
		},
	);

	electronTrpc.ports.subscribe.useSubscription(undefined, {
		onData: () => {
			utils.ports.getAll.invalidate();
		},
	});

	const ports = detectedPorts ?? [];

	const { data: recentProjects } =
		electronTrpc.projects.getRecents.useQuery();

	const workspaceNames = useMemo(() => {
		if (!allWorkspaces) return {};
		const projectNames: Record<string, string> = {};
		if (recentProjects) {
			for (const p of recentProjects) {
				projectNames[p.id] = p.name;
			}
		}
		return allWorkspaces.reduce(
			(acc, ws) => {
				const projectName = projectNames[ws.projectId];
				acc[ws.id] = projectName
					? `${projectName}: ${ws.name}`
					: ws.name;
				return acc;
			},
			{} as Record<string, string>,
		);
	}, [allWorkspaces, recentProjects]);

	const workspacePortGroups = useMemo(() => {
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

		return groups.sort((a, b) =>
			a.workspaceName.localeCompare(b.workspaceName),
		);
	}, [ports, workspaceNames]);

	const totalPortCount = workspacePortGroups.reduce(
		(sum, g) => sum + g.ports.length,
		0,
	);

	return {
		workspacePortGroups,
		totalPortCount,
	};
}
