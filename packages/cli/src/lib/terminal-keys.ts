const NAMED_KEYS = new Map<string, string>([
	["enter", "\r"],
	["return", "\r"],
	["esc", "\x1b"],
	["escape", "\x1b"],
	["tab", "\t"],
	["backspace", "\x7f"],
	["space", " "],
	["up", "\x1b[A"],
	["down", "\x1b[B"],
	["right", "\x1b[C"],
	["left", "\x1b[D"],
	["home", "\x1b[H"],
	["end", "\x1b[F"],
	["pageup", "\x1b[5~"],
	["pagedown", "\x1b[6~"],
	["delete", "\x1b[3~"],
]);

export const KNOWN_KEY_NAMES: readonly string[] = [...NAMED_KEYS.keys()];

const CTRL_PREFIX = "ctrl+";
const ESCAPE = "\x1b";

/**
 * tmux's recommended escape-time. A keypress parser that sees Escape and the
 * next key in one read treats them as one Meta chord (`\x1b\r` is Alt+Enter,
 * not Escape then Enter), so a bare Escape is written alone and the next
 * write waits this long.
 */
export const KEY_WRITE_GAP_MS = 50;

export interface KeyWrite {
	data: string;
	/** The normalized key names this write carries, in order. */
	keys: string[];
	gapAfterMs: number;
}

export function normalizeKeyName(name: string): string {
	return name.trim().toLowerCase();
}

export function encodeKeyName(name: string): string | undefined {
	const normalized = normalizeKeyName(name);
	const named = NAMED_KEYS.get(normalized);
	if (named !== undefined) return named;

	if (normalized.startsWith(CTRL_PREFIX)) {
		const letter = normalized.slice(CTRL_PREFIX.length);
		if (!/^[a-z]$/.test(letter)) return undefined;
		return String.fromCharCode(letter.charCodeAt(0) - 96);
	}

	return undefined;
}

/**
 * Split key presses into PTY writes. Keys that form complete sequences on
 * their own share a write; a bare Escape gets a write of its own with a gap
 * on both sides, so no parser can glue it to a neighbour.
 */
export function planKeyWrites(names: string[]): {
	writes: KeyWrite[];
	unknown: string[];
} {
	const unknown: string[] = [];
	const chunks: Array<{ data: string; keys: string[] }> = [];
	let pending: { data: string; keys: string[] } | undefined;
	const flush = () => {
		if (pending) chunks.push(pending);
		pending = undefined;
	};

	for (const name of names) {
		const normalized = normalizeKeyName(name);
		const encoded = encodeKeyName(normalized);
		if (encoded === undefined) {
			unknown.push(name);
		} else if (encoded === ESCAPE) {
			flush();
			chunks.push({ data: encoded, keys: [normalized] });
		} else if (pending) {
			pending.data += encoded;
			pending.keys.push(normalized);
		} else {
			pending = { data: encoded, keys: [normalized] };
		}
	}
	flush();

	return {
		unknown,
		writes: chunks.map((chunk, index) => ({
			...chunk,
			gapAfterMs: index < chunks.length - 1 ? KEY_WRITE_GAP_MS : 0,
		})),
	};
}
