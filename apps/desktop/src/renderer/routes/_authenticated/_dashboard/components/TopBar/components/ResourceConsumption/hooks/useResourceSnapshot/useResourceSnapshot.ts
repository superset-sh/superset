import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	getResourceMonitorRefetchInterval,
	shouldQueryResourceMonitor,
} from "../../resourceConsumptionPolicy";
import type { ResourceMetricsSnapshot } from "../../types";
import { normalizeResourceMetricsSnapshot } from "../../utils/normalizeSnapshot";

function getTerminalIdFromPaneData(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const terminalId = (data as { terminalId?: unknown }).terminalId;
	return typeof terminalId === "string" && terminalId.length > 0
		? terminalId
		: null;
}

function getTerminalTitleOverrides(
	rows: Array<{ paneLayout: unknown }>,
): Map<string, string> {
	const overrides = new Map<string, string>();
	for (const row of rows) {
		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!Array.isArray(layout?.tabs)) continue;
		for (const tab of layout.tabs) {
			if (!tab.panes || typeof tab.panes !== "object") continue;
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "terminal" || !pane.titleOverride) continue;
				const terminalId = getTerminalIdFromPaneData(pane.data);
				if (terminalId && !overrides.has(terminalId)) {
					overrides.set(terminalId, pane.titleOverride);
				}
			}
		}
	}
	return overrides;
}

interface UseResourceSnapshotResult {
	snapshot: ResourceMetricsSnapshot | null;
	refetch: () => void;
	isFetching: boolean;
	sidebarProjectOrder: string[];
	sidebarWorkspaceOrder: string[];
}

/**
 * Polls the resource-metrics snapshot (2s interval) while mounted and
 * normalizes it, enriching rows with project/workspace names and terminal
 * title overrides. Only mount this while a resource view is visible — the
 * polling stops when the consumer unmounts.
 */
export function useResourceSnapshot(): UseResourceSnapshotResult {
	const collections = useCollections();
	const organizationId = useActiveOrganizationId() ?? undefined;

	const { data: rawSidebarProjects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.sidebarProjects })
				.orderBy(({ sp }) => sp.tabOrder, "asc")
				.select(({ sp }) => ({ projectId: sp.projectId })),
		[collections],
	);

	const { data: rawSidebarWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.workspaceLocalState })
				.orderBy(({ ws }) => ws.sidebarState.tabOrder, "asc")
				.select(({ ws }) => ({
					workspaceId: ws.workspaceId,
					isHidden: ws.sidebarState.isHidden,
					paneLayout: ws.paneLayout,
				})),
		[collections],
	);

	const sidebarProjectOrder = useMemo(
		() => rawSidebarProjects.map((p) => p.projectId),
		[rawSidebarProjects],
	);

	const sidebarWorkspaceOrder = useMemo(
		() =>
			getVisibleSidebarWorkspaces(rawSidebarWorkspaces).map(
				(w) => w.workspaceId,
			),
		[rawSidebarWorkspaces],
	);

	const terminalTitleOverrides = useMemo(
		() => getTerminalTitleOverrides(rawSidebarWorkspaces),
		[rawSidebarWorkspaces],
	);

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects } = useHostProjects();
	const rawProjects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);

	const { workspaces: rawWorkspaces } = useHostWorkspaces();

	const shouldQueryMetrics = shouldQueryResourceMonitor({
		enabled: true,
		open: true,
	});

	const {
		data: snapshot,
		refetch,
		isFetching,
	} = electronTrpc.resourceMetrics.getSnapshot.useQuery(
		{
			mode: "interactive",
			organizationId,
		},
		{
			enabled: shouldQueryMetrics,
			refetchInterval: getResourceMonitorRefetchInterval(true),
		},
	);

	useEffect(() => {
		if (!isFetching) return;
		logStressEvent("resource-monitor.fetch");
	}, [isFetching]);

	const normalizedSnapshot = useMemo(() => {
		const normalized = normalizeResourceMetricsSnapshot(snapshot);
		if (!normalized) return normalized;

		const projectById = new Map(
			rawProjects.map((project) => [project.id, project]),
		);
		const workspaceById = new Map(
			rawWorkspaces.map((workspace) => [workspace.id, workspace]),
		);

		return {
			...normalized,
			workspaces: normalized.workspaces.map((workspace) => {
				const hostWorkspace = workspaceById.get(workspace.workspaceId);
				const projectId = hostWorkspace?.projectId ?? workspace.projectId;
				const project = projectById.get(projectId);
				return {
					...workspace,
					projectId,
					projectName: project?.name ?? workspace.projectName,
					workspaceName: hostWorkspace?.name ?? workspace.workspaceName,
					sessions: workspace.sessions.map((session) => ({
						...session,
						title:
							terminalTitleOverrides.get(session.paneId) ??
							session.title ??
							null,
					})),
				};
			}),
		};
	}, [snapshot, rawProjects, rawWorkspaces, terminalTitleOverrides]);

	return {
		snapshot: normalizedSnapshot,
		refetch,
		isFetching,
		sidebarProjectOrder,
		sidebarWorkspaceOrder,
	};
}
