export interface DetectedPort {
	port: number;
	pid: number;
	processName: string;
	paneId: string;
	workspaceId: string;
	detectedAt: number;
	address: string;
}

export interface StaticPort {
	port: number;
	label: string;
	workspaceId: string;
}

export interface StaticPortsResult {
	exists: boolean;
	ports: Omit<StaticPort, "workspaceId">[] | null;
	error: string | null;
}

export interface EnrichedPort extends DetectedPort {
	label: string | null;
}
