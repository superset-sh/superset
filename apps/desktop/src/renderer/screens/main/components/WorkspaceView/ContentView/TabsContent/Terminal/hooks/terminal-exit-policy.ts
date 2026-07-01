export const RESTORED_SESSION_CLEAN_EXIT_GRACE_MS = 10_000;

export function shouldAutoCloseTerminalOnCleanExit(params: {
	exitCode: number;
	isWorkspaceRunPane: boolean;
	preserveUntilMs?: number;
	now?: number;
}): boolean {
	const {
		exitCode,
		isWorkspaceRunPane,
		preserveUntilMs = 0,
		now = Date.now(),
	} = params;

	if (exitCode !== 0 || isWorkspaceRunPane) {
		return false;
	}

	return preserveUntilMs <= now;
}
