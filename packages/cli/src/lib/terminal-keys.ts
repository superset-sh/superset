import { CLIError } from "@superset/cli-framework";

const NAMED_KEYS: Record<string, string> = {
	esc: "\x1b",
	escape: "\x1b",
	enter: "\r",
	return: "\r",
	tab: "\t",
	"shift+tab": "\x1b[Z",
	backspace: "\x7f",
	space: " ",
	comma: ",",
	up: "\x1b[A",
	down: "\x1b[B",
	right: "\x1b[C",
	left: "\x1b[D",
	home: "\x1b[H",
	end: "\x1b[F",
	pageup: "\x1b[5~",
	pagedown: "\x1b[6~",
	delete: "\x1b[3~",
	f1: "\x1bOP",
	f2: "\x1bOQ",
	f3: "\x1bOR",
	f4: "\x1bOS",
	f5: "\x1b[15~",
	f6: "\x1b[17~",
	f7: "\x1b[18~",
	f8: "\x1b[19~",
	f9: "\x1b[20~",
	f10: "\x1b[21~",
	f11: "\x1b[23~",
	f12: "\x1b[24~",
};

export const INTERRUPT_KEYS = new Set(["\x1b", "\x03"]);

export function parseTerminalKeys(spec: string): string[] {
	const names = spec
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (names.length === 0) {
		throw new CLIError("No keys given", "Example: --keys esc or --keys ctrl+c");
	}
	return names.map(keyBytes);
}

function keyBytes(key: string): string {
	if ([...key].length === 1) return key;
	const name = key.toLowerCase().replace(/^c-/, "ctrl+").replace(/^m-/, "alt+");
	const named = NAMED_KEYS[name];
	if (named) return named;
	const ctrl = /^ctrl\+([a-z])$/.exec(name);
	if (ctrl?.[1]) return String.fromCharCode(ctrl[1].charCodeAt(0) - 96);
	const alt = /^alt\+(.+)$/.exec(name);
	if (alt?.[1]) return `\x1b${keyBytes(alt[1])}`;
	throw new CLIError(
		`Unknown key: ${key}`,
		`Use a single character, ctrl+<letter>, alt+<key>, or one of: ${Object.keys(NAMED_KEYS).join(", ")}`,
	);
}
