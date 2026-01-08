import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";

export interface CachedTerminal {
	xterm: XTerm;
	fitAddon: FitAddon;
	searchAddon: SearchAddon | null;
	/** The container div that holds the terminal - preserved across mounts */
	terminalElement: HTMLDivElement;
	cleanup: () => void;
}

/**
 * Cache for terminal instances, following Hyper's pattern.
 * Terminals are preserved across component mount/unmount cycles
 * to maintain terminal state (modes, alternate buffer, etc).
 */
const terminalCache = new Map<string, CachedTerminal>();

export function getCachedTerminal(paneId: string): CachedTerminal | undefined {
	return terminalCache.get(paneId);
}

export function setCachedTerminal(
	paneId: string,
	terminal: CachedTerminal,
): void {
	terminalCache.set(paneId, terminal);
}

export function removeCachedTerminal(paneId: string): void {
	const cached = terminalCache.get(paneId);
	if (cached) {
		cached.cleanup();
		cached.xterm.dispose();
		terminalCache.delete(paneId);
	}
}

export function hasCachedTerminal(paneId: string): boolean {
	return terminalCache.has(paneId);
}
