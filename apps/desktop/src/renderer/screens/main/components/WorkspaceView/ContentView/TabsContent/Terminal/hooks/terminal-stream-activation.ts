export function shouldActivateCachedTerminalStream(params: {
	hasStoredColdRestore: boolean;
	isColdRestore: boolean | undefined;
}): boolean {
	return !params.hasStoredColdRestore && !params.isColdRestore;
}
