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
	url?: string;
	workspaceId: string;
}

export interface StaticPortsResult {
	exists: boolean;
	ports: Omit<StaticPort, "workspaceId">[] | null;
	check: string | null;
	error: string | null;
}

export interface EnrichedPort extends DetectedPort {
	label: string | null;
	url: string | null;
}

/** Output format from custom port-check scripts */
export interface ScriptPort {
	port: number;
	name?: string;
	url?: string;
	pid?: number;
}
