import { getHostServiceCoordinator } from "main/lib/host-service-coordinator";
import {
	parseResourceSessions,
	type WorkspaceSessionMap,
} from "./session-normalization";

interface WorkspaceMetadata {
	workspaceName: string;
	projectId: string;
	projectName: string;
}

const RESOURCE_SESSIONS_FETCH_TIMEOUT_MS = 2500;

function isAbortError(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"name" in error &&
		(error as { name?: unknown }).name === "AbortError"
	);
}

function mergeWorkspaceSessionMaps(
	target: WorkspaceSessionMap,
	source: WorkspaceSessionMap,
): void {
	for (const [workspaceId, entries] of source) {
		const targetEntries = target.get(workspaceId);
		if (targetEntries) {
			targetEntries.push(...entries);
		} else {
			target.set(workspaceId, [...entries]);
		}
	}
}

export async function collectWorkspaceSessionMap(
	organizationId?: string,
): Promise<WorkspaceSessionMap> {
	const coordinator = getHostServiceCoordinator();
	const organizationIds = organizationId
		? [organizationId]
		: coordinator.getActiveOrganizationIds();
	const workspaceSessionMap: WorkspaceSessionMap = new Map();

	await Promise.all(
		organizationIds.map(async (id) => {
			const connection = coordinator.getConnection(id);
			if (!connection) return;

			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				RESOURCE_SESSIONS_FETCH_TIMEOUT_MS,
			);
			try {
				const response = await fetch(
					`http://127.0.0.1:${connection.port}/terminal/resource-sessions`,
					{
						headers: {
							Authorization: `Bearer ${connection.secret}`,
						},
						signal: controller.signal,
					},
				);
				if (!response.ok) {
					console.warn(
						`[resource-metrics] Failed to list v2 terminal resource sessions for org ${id}: ${response.status}`,
					);
					return;
				}
				mergeWorkspaceSessionMaps(
					workspaceSessionMap,
					parseResourceSessions(await response.json()),
				);
			} catch (error) {
				if (isAbortError(error)) {
					console.warn(
						`[resource-metrics] Timed out listing v2 terminal resource sessions for org ${id}`,
					);
					return;
				}
				console.warn(
					`[resource-metrics] Failed to list v2 terminal resource sessions for org ${id}`,
					error,
				);
			} finally {
				clearTimeout(timeoutId);
			}
		}),
	);

	return workspaceSessionMap;
}

export function getWorkspaceMetadata(workspaceId: string): WorkspaceMetadata {
	// Workspace/project display names are hydrated in the renderer from the
	// host fan-out. Keep stable non-empty placeholders for validation.
	return {
		workspaceName: `Workspace ${workspaceId.slice(0, 8)}`,
		projectId: "unknown",
		projectName: "Workspaces",
	};
}
