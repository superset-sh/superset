export interface DetectedPort {
	port: number;
	pid: number;
	processName: string;
	terminalId: string;
	workspaceId: string;
	detectedAt: number;
	address: string;
}
