import { IMPORT_MAX_TOML_LINES, isFieldWithinLimit } from "../limits";

export const NON_STRING = Symbol("non-string");
export const TOO_LARGE = Symbol("too-large");

export interface TomlEntry {
	/** Dotted table name, "" for the root table. */
	table: string;
	/** Position within an array of tables (`[[table]]`). */
	arrayIndex?: number;
	key: string;
	value: string | typeof NON_STRING | typeof TOO_LARGE;
}

const BASIC_ESCAPES: Record<string, string> = {
	b: "\b",
	t: "\t",
	n: "\n",
	f: "\f",
	r: "\r",
	e: "\x1b",
	'"': '"',
	"\\": "\\",
};

function isUnicodeScalar(code: number): boolean {
	return (
		Number.isInteger(code) &&
		code >= 0 &&
		code <= 0x10ffff &&
		(code < 0xd800 || code > 0xdfff)
	);
}

/** Splits a dotted key, unquoting `"..."` and `'...'` parts; null if malformed. */
export function decodeDottedKey(raw: string): string | null {
	const parts: string[] = [];
	let rest = raw.trim();
	while (rest.length > 0) {
		let part: string;
		if (rest.startsWith('"')) {
			const match = rest.match(/^"((?:[^"\\]|\\.)*)"/);
			if (!match) return null;
			try {
				part = JSON.parse(match[0]) as string;
			} catch {
				return null;
			}
			rest = rest.slice(match[0].length);
		} else if (rest.startsWith("'")) {
			const end = rest.indexOf("'", 1);
			if (end === -1) return null;
			part = rest.slice(1, end);
			rest = rest.slice(end + 1);
		} else {
			const match = rest.match(/^[A-Za-z0-9_-]+/);
			if (!match) return null;
			part = match[0];
			rest = rest.slice(part.length);
		}
		parts.push(part);
		rest = rest.trimStart();
		if (rest.length === 0) break;
		if (!rest.startsWith(".")) return null;
		rest = rest.slice(1).trimStart();
	}
	return parts.length > 0 ? parts.join(".") : null;
}

/**
 * Reads the key/value pairs of a TOML file, with string values decoded. Only
 * strings are decoded, which is all the setup import needs; other values are
 * marked {@link NON_STRING}. Returns null for a file it cannot read.
 */
export function readTomlEntries(content: string): TomlEntry[] | null {
	let lines = 1;
	for (const char of content) {
		if (char === "\n" && ++lines > IMPORT_MAX_TOML_LINES) return null;
	}

	const entries: TomlEntry[] = [];
	const arrayCounts = new Map<string, number>();
	let table = "";
	let arrayIndex: number | undefined;
	let pos = 0;

	const atLineEnd = () => {
		while (pos < content.length && /[ \t]/.test(content[pos] ?? "")) pos++;
		if (content[pos] === "#") {
			while (pos < content.length && content[pos] !== "\n") pos++;
		}
		return (
			pos >= content.length ||
			content[pos] === "\n" ||
			content.startsWith("\r\n", pos)
		);
	};

	const readBasic = (multiline: boolean): string | null => {
		const delimiter = multiline ? '"""' : '"';
		let out = "";
		if (multiline && content[pos] === "\n") pos++;
		else if (multiline && content.startsWith("\r\n", pos)) pos += 2;
		while (pos < content.length) {
			if (content.startsWith(delimiter, pos)) {
				pos += delimiter.length;
				// A multi-line string may end with up to two extra quotes.
				for (
					let extra = 0;
					multiline && extra < 2 && content[pos] === '"';
					extra++
				) {
					out += '"';
					pos++;
				}
				return out;
			}
			const char = content[pos] ?? "";
			if (!multiline && char === "\n") return null;
			if (char !== "\\") {
				out += char;
				pos++;
				continue;
			}
			const next = content[pos + 1] ?? "";
			if (multiline && /[ \t\r\n]/.test(next)) {
				pos++;
				while (/[ \t\r\n]/.test(content[pos] ?? "")) pos++;
				continue;
			}
			if (next === "u" || next === "U") {
				const length = next === "u" ? 4 : 8;
				const code = Number.parseInt(
					content.slice(pos + 2, pos + 2 + length),
					16,
				);
				if (!isUnicodeScalar(code)) return null;
				out += String.fromCodePoint(code);
				pos += 2 + length;
				continue;
			}
			const escaped = BASIC_ESCAPES[next];
			if (escaped === undefined) return null;
			out += escaped;
			pos += 2;
		}
		return null;
	};

	const readLiteral = (multiline: boolean): string | null => {
		const delimiter = multiline ? "'''" : "'";
		if (multiline && content[pos] === "\n") pos++;
		else if (multiline && content.startsWith("\r\n", pos)) pos += 2;
		const end = content.indexOf(delimiter, pos);
		if (end === -1) return null;
		let value = content.slice(pos, end);
		if (!multiline && value.includes("\n")) return null;
		pos = end + delimiter.length;
		for (
			let extra = 0;
			multiline && extra < 2 && content[pos] === "'";
			extra++
		) {
			value += "'";
			pos++;
		}
		return value;
	};

	const skipOtherValue = () => {
		let depth = 0;
		while (pos < content.length) {
			const char = content[pos] ?? "";
			if (char === '"' || char === "'") {
				pos++;
				if ((char === '"' ? readBasic(false) : readLiteral(false)) === null) {
					return false;
				}
				continue;
			}
			if (char === "#" && depth > 0) {
				while (pos < content.length && content[pos] !== "\n") pos++;
				continue;
			}
			if (char === "[" || char === "{") depth++;
			if (char === "]" || char === "}") depth--;
			if (char === "\n" && depth <= 0) return true;
			pos++;
		}
		return depth <= 0;
	};

	const readKey = (): string | null => {
		const start = pos;
		const end = content.indexOf("=", pos);
		const lineEnd = content.indexOf("\n", pos);
		if (end === -1 || (lineEnd !== -1 && lineEnd < end)) return null;
		pos = end + 1;
		return decodeDottedKey(content.slice(start, end));
	};

	while (pos < content.length) {
		const char = content[pos] ?? "";
		if (/\s/.test(char)) {
			pos++;
			continue;
		}
		if (char === "#") {
			while (pos < content.length && content[pos] !== "\n") pos++;
			continue;
		}
		if (char === "[") {
			const isArray = content.startsWith("[[", pos);
			const close = content.indexOf(isArray ? "]]" : "]", pos);
			const lineEnd = content.indexOf("\n", pos);
			if (close === -1 || (lineEnd !== -1 && lineEnd < close)) return null;
			const decoded = decodeDottedKey(
				content.slice(pos + (isArray ? 2 : 1), close),
			);
			if (decoded === null) return null;
			table = decoded;
			if (isArray) {
				arrayIndex = (arrayCounts.get(table) ?? -1) + 1;
				arrayCounts.set(table, arrayIndex);
			} else {
				arrayIndex = undefined;
			}
			pos = close + (isArray ? 2 : 1);
			if (!atLineEnd()) return null;
			continue;
		}

		const key = readKey();
		if (!key) return null;
		while (/[ \t]/.test(content[pos] ?? "")) pos++;

		let value: TomlEntry["value"];
		if (content.startsWith('"""', pos)) {
			pos += 3;
			const text = readBasic(true);
			if (text === null) return null;
			value = text;
		} else if (content.startsWith("'''", pos)) {
			pos += 3;
			const text = readLiteral(true);
			if (text === null) return null;
			value = text;
		} else if (content[pos] === '"' || content[pos] === "'") {
			const quote = content[pos];
			pos++;
			const text = quote === '"' ? readBasic(false) : readLiteral(false);
			if (text === null) return null;
			value = text;
		} else {
			if (!skipOtherValue()) return null;
			value = NON_STRING;
		}
		if (typeof value === "string" && !isFieldWithinLimit(value)) {
			value = TOO_LARGE;
		}
		if (!atLineEnd()) return null;
		entries.push({
			table,
			...(arrayIndex !== undefined && { arrayIndex }),
			key,
			value,
		});
	}
	return entries;
}
