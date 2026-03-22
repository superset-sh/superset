export function shouldKeepAttachAliveOnUnmount({
	paneDestroyed,
	hasWorkspaceRun,
	isStartingWorkspaceRun,
	hasActiveAttachRequest,
}: {
	paneDestroyed: boolean;
	hasWorkspaceRun: boolean;
	isStartingWorkspaceRun: boolean;
	hasActiveAttachRequest: boolean;
}): boolean {
	return (
		!paneDestroyed &&
		hasWorkspaceRun &&
		(isStartingWorkspaceRun || hasActiveAttachRequest)
	);
}
