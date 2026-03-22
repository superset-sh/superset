export type WorkspaceRunTransition = "starting" | "stopping" | null;
export type WorkspaceRunUiState =
	| "setup"
	| "idle"
	| "starting"
	| "running"
	| "stopping";

export function getWorkspaceRunUiState({
	hasRunCommand,
	isRunning,
	isStopRequested,
	transition,
}: {
	hasRunCommand: boolean;
	isRunning: boolean;
	isStopRequested: boolean;
	transition: WorkspaceRunTransition;
}): WorkspaceRunUiState {
	if (transition === "starting") return "starting";
	if ((transition === "stopping" || isStopRequested) && isRunning) {
		return "stopping";
	}
	if (isRunning) return "running";
	if (!hasRunCommand) return "setup";
	return "idle";
}
