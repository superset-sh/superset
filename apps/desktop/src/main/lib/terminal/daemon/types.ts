export interface SessionInfo {
	paneId: string;
	workspaceId: string;
	isAlive: boolean;
	lastActive: number;
	cwd: string;
	pid: number | null;
	cols: number;
	rows: number;
	exitReason?: "killed" | "exited" | "error";
	killedByUserAt?: number;
}

export interface ColdRestoreInfo {
	scrollback: string;
	previousCwd: string | undefined;
	cols: number;
	rows: number;
	// Command to run once the restored shell is alive. Usually an agent resume
	// command, but can fall back to the original Superset launch command.
	resumeCommand?: string;
}
