export interface DetectedPort {
	port: number;
	pid: number;
	processName: string;
	paneId: string;
	workspaceId: string;
	detectedAt: number;
	address: string;
}
