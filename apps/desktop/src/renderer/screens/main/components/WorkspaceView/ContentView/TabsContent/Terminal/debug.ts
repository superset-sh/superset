export const TERMINAL_DEBUG_STORAGE_KEY = "SUPERSET_TERMINAL_DEBUG";
export const TERMINAL_DEBUG_PANE_STORAGE_KEY = "SUPERSET_TERMINAL_DEBUG_PANE";

const TERMINAL_DEBUG_CHANNELS = [
	"attach",
	"connection",
	"dom",
	"focus",
	"lifecycle",
	"resize",
	"restore",
	"stream",
] as const;

export type TerminalDebugChannel = (typeof TERMINAL_DEBUG_CHANNELS)[number];

function readTerminalDebugValue(key: string): string | null {
	if (typeof window === "undefined") return null;

	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function parseTerminalDebugChannels(
	raw: string | null,
): Set<TerminalDebugChannel> | "all" {
	if (!raw) return new Set();

	const normalized = raw.trim().toLowerCase();
	if (
		normalized === "1" ||
		normalized === "true" ||
		normalized === "*" ||
		normalized === "all"
	) {
		return "all";
	}

	const allowed = new Set<string>(TERMINAL_DEBUG_CHANNELS);
	const channels = new Set<TerminalDebugChannel>();

	for (const token of normalized.split(",")) {
		const channel = token.trim();
		if (allowed.has(channel)) {
			channels.add(channel as TerminalDebugChannel);
		}
	}

	return channels;
}

export function isTerminalDebugEnabled(
	channel: TerminalDebugChannel,
	paneId?: string,
): boolean {
	const channels = parseTerminalDebugChannels(
		readTerminalDebugValue(TERMINAL_DEBUG_STORAGE_KEY),
	);

	if (channels !== "all" && !channels.has(channel)) {
		return false;
	}

	const paneFilter = readTerminalDebugValue(TERMINAL_DEBUG_PANE_STORAGE_KEY)
		?.trim()
		.toLowerCase();

	if (!paneFilter) return true;
	if (!paneId) return false;

	return paneFilter === paneId.toLowerCase();
}

export function terminalDebugLog(
	channel: TerminalDebugChannel,
	paneId: string | undefined,
	message: string,
	details?: unknown,
): void {
	if (!isTerminalDebugEnabled(channel, paneId)) return;

	const prefix = `[Terminal:${channel}]${paneId ? ` ${paneId}` : ""} ${message}`;
	if (details === undefined) {
		console.debug(prefix);
		return;
	}

	console.debug(prefix, details);
}
