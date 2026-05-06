export type UsageSeverity = "normal" | "elevated" | "high";

export type SortOption = "memory" | "cpu" | "name" | "sidebar";

export interface UsageValues {
	cpu: number;
	memory: number;
}

export interface UsageClasses {
	rowClass: string;
	hoverClass: string;
	labelClass: string;
	metricClass: string;
}

export interface SessionMetrics extends UsageValues {
	sessionId: string;
	paneId: string;
	pid: number;
}

export interface WorkspaceMetrics extends UsageValues {
	workspaceId: string;
	projectId: string;
	projectName: string;
	workspaceName: string;
	sessions: SessionMetrics[];
}

export interface AppMetrics extends UsageValues {
	main: UsageValues;
	renderer: UsageValues;
	other: UsageValues;
}

export interface HostMetrics {
	totalMemory: number;
	freeMemory: number;
	usedMemory: number;
	memoryUsagePercent: number;
	cpuCoreCount: number;
	loadAverage1m: number;
}

export interface ResourceMetricsSnapshot {
	app: AppMetrics;
	workspaces: WorkspaceMetrics[];
	host: HostMetrics;
	totalCpu: number;
	totalMemory: number;
	collectedAt: number;
}
