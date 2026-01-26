export interface SessionInfo {
	paneId: string;
	workspaceId: string;
	isAlive: boolean;
	lastActive: number;
	cwd: string;
	pid: number | null;
	cols: number;
	rows: number;
}

export interface ColdRestoreInfo {
	scrollback: string;
	previousCwd: string | undefined;
	cols: number;
	rows: number;
}
