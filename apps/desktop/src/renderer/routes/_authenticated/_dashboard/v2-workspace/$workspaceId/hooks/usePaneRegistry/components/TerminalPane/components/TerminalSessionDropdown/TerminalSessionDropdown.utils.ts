export const TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS = 2_000;
export const TERMINAL_SESSION_LIST_STALE_MS = 5_000;

export function shouldQueryTerminalSessionList(isOpen: boolean): boolean {
	return isOpen;
}

export function getTerminalSessionListRefetchInterval(
	isOpen: boolean,
): false | number {
	return isOpen ? TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS : false;
}
