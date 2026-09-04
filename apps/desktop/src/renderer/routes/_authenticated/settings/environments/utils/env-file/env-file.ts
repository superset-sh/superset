// Parser grammar from dotenv (BSD-2-Clause), which cannot be imported here:
// its module root pulls in fs, path, os and crypto.
const LINE =
	/(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

const INVALID = {
	ok: false as const,
	error: "Please upload a valid .env file.",
};

export interface EnvEntry {
	key: string;
	value: string;
}

export function parseEnvContent(content: string): EnvEntry[] {
	const entries: EnvEntry[] = [];
	const normalised = content.replace(/\r\n?/gm, "\n");

	LINE.lastIndex = 0;
	let match = LINE.exec(normalised);
	while (match !== null) {
		const key = match[1];
		let value = (match[2] ?? "").trim();
		const quote = value[0];

		value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");
		if (quote === '"') {
			value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
		}

		entries.push({ key, value });
		match = LINE.exec(normalised);
	}

	return entries;
}

export function validateEnvContent(
	text: string,
): { ok: true } | { ok: false; error: string } {
	if (text.includes("\0")) return INVALID;
	return parseEnvContent(text).length > 0 ? { ok: true } : INVALID;
}
