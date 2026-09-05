const NAMED_KEYS: Record<string, string> = {
	enter: "\r",
	return: "\r",
	esc: "\x1b",
	escape: "\x1b",
	tab: "\t",
	backspace: "\x7f",
	space: " ",
	up: "\x1b[A",
	down: "\x1b[B",
	right: "\x1b[C",
	left: "\x1b[D",
	home: "\x1b[H",
	end: "\x1b[F",
	pageup: "\x1b[5~",
	pagedown: "\x1b[6~",
	delete: "\x1b[3~",
};

export const KNOWN_KEY_NAMES: readonly string[] = Object.keys(NAMED_KEYS);

const CTRL_PREFIX = "ctrl+";

export function normalizeKeyName(name: string): string {
	return name.trim().toLowerCase();
}

export function encodeKeyName(name: string): string | undefined {
	const normalized = normalizeKeyName(name);
	const named = NAMED_KEYS[normalized];
	if (named !== undefined) return named;

	if (normalized.startsWith(CTRL_PREFIX)) {
		const letter = normalized.slice(CTRL_PREFIX.length);
		if (!/^[a-z]$/.test(letter)) return undefined;
		// Terminal convention: Ctrl+<letter> is the letter's code minus 0x60.
		return String.fromCharCode(letter.charCodeAt(0) - 96);
	}

	return undefined;
}

export function encodeKeys(names: string[]): {
	bytes: string;
	unknown: string[];
} {
	let bytes = "";
	const unknown: string[] = [];
	for (const name of names) {
		const encoded = encodeKeyName(name);
		if (encoded === undefined) {
			unknown.push(name);
		} else {
			bytes += encoded;
		}
	}
	return { bytes, unknown };
}
