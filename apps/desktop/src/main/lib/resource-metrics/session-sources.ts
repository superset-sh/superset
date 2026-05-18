import { projects, workspaces } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { getHostServiceCoordinator } from "main/lib/host-service-coordinator";
import { localDb } from "main/lib/local-db";
import { getWorkspaceRuntimeRegistry } from "main/lib/workspace-runtime/registry";
import {
	parseV2ResourceSessions,
	type WorkspaceSessionMap,
} from "./session-normalization";

export type ResourceMetricsSurface = "v1" | "v2";

export interface WorkspaceMetadata {
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

async function collectV1WorkspaceSessionMap(): Promise<WorkspaceSessionMap> {
	const registry = getWorkspaceRuntimeRegistry();
	const { sessions } = await registry
		.getDefault()
		.terminal.management.listSessions();
	const workspaceSessionMap: WorkspaceSessionMap = new Map();

	for (const session of sessions) {
		if (!session.isAlive || session.pid == null) continue;

		let entries = workspaceSessionMap.get(session.workspaceId);
		if (!entries) {
			entries = [];
			workspaceSessionMap.set(session.workspaceId, entries);
		}
		entries.push({
			sessionId: session.sessionId,
			paneId: session.paneId,
			pid: session.pid,
			title: null,
		});
	}

	return workspaceSessionMap;
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

async function collectV2WorkspaceSessionMap(
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
					parseV2ResourceSessions(await response.json()),
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

export function collectWorkspaceSessionMap({
	surface,
	organizationId,
}: {
	surface: ResourceMetricsSurface;
	organizationId?: string;
}): Promise<WorkspaceSessionMap> {
	return surface === "v2"
		? collectV2WorkspaceSessionMap(organizationId)
		: collectV1WorkspaceSessionMap();
}

export function getWorkspaceMetadata(
	surface: ResourceMetricsSurface,
	workspaceId: string,
): WorkspaceMetadata {
	if (surface === "v1") {
		const ws = localDb
			.select({
				workspaceName: workspaces.name,
				projectId: workspaces.projectId,
				projectName: projects.name,
			})
			.from(workspaces)
			.leftJoin(projects, eq(projects.id, workspaces.projectId))
			.where(eq(workspaces.id, workspaceId))
			.get();

		return {
			workspaceName: ws?.workspaceName ?? "Unknown",
			projectId: ws?.projectId ?? "unknown",
			projectName: ws?.projectName ?? "Unknown Project",
		};
	}

	// v2 workspace/project display names are hydrated in the renderer from
	// Electric collections. Keep stable non-empty placeholders for validation.
	return {
		workspaceName: `Workspace ${workspaceId.slice(0, 8)}`,
		projectId: "v2",
		projectName: "V2 Workspaces",
	};
}
