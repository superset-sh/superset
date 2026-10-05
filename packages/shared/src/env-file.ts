// Parser grammar from dotenv (BSD-2-Clause), which cannot be imported in the
// renderer: its module root pulls in fs, path, os and crypto.
const LINE =
	/(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

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
		const [, key, rawValue] = match;
		match = LINE.exec(normalised);
		if (!key) continue;
		let value = (rawValue ?? "").trim();
		const quote = value[0];

		value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");
		if (quote === '"') {
			value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
		}

		entries.push({ key, value });
	}

	return entries;
}
