import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";

export const TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS = 2_000;
export const TERMINAL_SESSION_LIST_STALE_MS = 5_000;

/**
 * Explicitly send a terminal to the background instead of killing it.
 *
 * Reuses the existing release-instead-of-kill path: marking the terminal makes
 * `onAfterClose` (in usePaneRegistry) take the `terminalRuntimeRegistry.release`
 * branch — keeping the session running with no pane attached — rather than
 * disposing the runtime and killing the session. The session then shows up in
 * the Background terminal sessions dropdown, where it can be re-opened or killed.
 */
export function sendTerminalToBackground(
	{ terminalId, workspaceId }: { terminalId: string; workspaceId: string },
	{ close }: { close: () => void },
): void {
	markTerminalForBackground(terminalId, workspaceId);
	close();
}

export function shouldQueryTerminalSessionList(isOpen: boolean): boolean {
	return isOpen;
}

export function getTerminalSessionListRefetchInterval(
	isOpen: boolean,
): false | number {
	return isOpen ? TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS : false;
}

export function getTerminalDisplayTitle({
	titleOverride,
	runtimeTitle,
	sessionTitle,
}: {
	titleOverride?: string;
	runtimeTitle?: string | null;
	sessionTitle?: string | null;
}): string {
	// Explicit pane titles come from user/preset labels, so they should not be
	// hidden by transient shell-reported titles such as "zsh" or "Terminal".
	return titleOverride ?? runtimeTitle ?? sessionTitle ?? "Terminal";
}
