export type UsageSeverity = "normal" | "elevated" | "high";

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
