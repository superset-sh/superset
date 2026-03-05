import type {
	AppMetrics,
	ResourceMetricsSnapshot,
	SessionMetrics,
	WorkspaceMetrics,
} from "../types";

function normalizeFiniteNumber(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.max(0, value);
}

function normalizeNonEmptyString(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeUsageValues(value: unknown): { cpu: number; memory: number } {
	const usage =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: undefined;

	return {
		cpu: normalizeFiniteNumber(usage?.cpu),
		memory: normalizeFiniteNumber(usage?.memory),
	};
}

function normalizeSession(
	value: unknown,
	index: number,
	fallbackWorkspaceId: string,
): SessionMetrics {
	const session =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: undefined;
	const usage = normalizeUsageValues(session);

	return {
		sessionId: normalizeNonEmptyString(
			session?.sessionId,
			`${fallbackWorkspaceId}-session-${index + 1}`,
		),
		paneId: normalizeNonEmptyString(
			session?.paneId,
			`${fallbackWorkspaceId}-pane-${index + 1}`,
		),
		pid: Math.floor(normalizeFiniteNumber(session?.pid)),
		cpu: usage.cpu,
		memory: usage.memory,
	};
}

function normalizeWorkspace(value: unknown, index: number): WorkspaceMetrics {
	const workspace =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: undefined;
	const usage = normalizeUsageValues(workspace);
	const workspaceId = normalizeNonEmptyString(
		workspace?.workspaceId,
		`workspace-${index + 1}`,
	);
	const rawSessions = Array.isArray(workspace?.sessions)
		? workspace.sessions
		: [];

	return {
		workspaceId,
		projectId: normalizeNonEmptyString(workspace?.projectId, "unknown"),
		projectName: normalizeNonEmptyString(
			workspace?.projectName,
			"Unknown Project",
		),
		workspaceName: normalizeNonEmptyString(
			workspace?.workspaceName,
			"Unknown Workspace",
		),
		cpu: usage.cpu,
		memory: usage.memory,
		sessions: rawSessions.map((session, sessionIndex) =>
			normalizeSession(session, sessionIndex, workspaceId),
		),
	};
}

function normalizeAppMetrics(value: unknown): AppMetrics {
	const app =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: undefined;
	const main = normalizeUsageValues(app?.main);
	const renderer = normalizeUsageValues(app?.renderer);
	const other = normalizeUsageValues(app?.other);

	return {
		main,
		renderer,
		other,
		cpu: main.cpu + renderer.cpu + other.cpu,
		memory: main.memory + renderer.memory + other.memory,
	};
}

export function normalizeResourceMetricsSnapshot(
	value: unknown,
): ResourceMetricsSnapshot | null {
	if (!value || typeof value !== "object") return null;
	const snapshot = value as Record<string, unknown>;
	const app = normalizeAppMetrics(snapshot.app);
	const workspaces = Array.isArray(snapshot.workspaces)
		? snapshot.workspaces.map((workspace, index) =>
				normalizeWorkspace(workspace, index),
			)
		: [];
	const workspaceCpuTotal = workspaces.reduce(
		(sum, workspace) => sum + workspace.cpu,
		0,
	);
	const workspaceMemoryTotal = workspaces.reduce(
		(sum, workspace) => sum + workspace.memory,
		0,
	);
	const host =
		snapshot.host && typeof snapshot.host === "object"
			? (snapshot.host as Record<string, unknown>)
			: undefined;
	const hostTotalMemory = normalizeFiniteNumber(host?.totalMemory);
	const hostFreeMemory = normalizeFiniteNumber(host?.freeMemory);
	const hostUsedMemory = Math.max(0, hostTotalMemory - hostFreeMemory);

	return {
		app,
		workspaces,
		host: {
			totalMemory: hostTotalMemory,
			freeMemory: hostFreeMemory,
			usedMemory: normalizeFiniteNumber(host?.usedMemory) || hostUsedMemory,
			memoryUsagePercent:
				hostTotalMemory > 0
					? normalizeFiniteNumber(host?.memoryUsagePercent) ||
						(hostUsedMemory / hostTotalMemory) * 100
					: 0,
			cpuCoreCount: Math.max(
				1,
				Math.floor(normalizeFiniteNumber(host?.cpuCoreCount)) || 1,
			),
			loadAverage1m: normalizeFiniteNumber(host?.loadAverage1m),
		},
		totalCpu:
			normalizeFiniteNumber(snapshot.totalCpu) || app.cpu + workspaceCpuTotal,
		totalMemory:
			normalizeFiniteNumber(snapshot.totalMemory) ||
			app.memory + workspaceMemoryTotal,
		collectedAt:
			typeof snapshot.collectedAt === "number" &&
			Number.isFinite(snapshot.collectedAt)
				? snapshot.collectedAt
				: Date.now(),
	};
}
