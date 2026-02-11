const ENV_LINE = /^(?:export\s+)?[a-zA-Z_]\w*\s*=/;
const INVALID = {
	ok: false as const,
	error: "Please upload a valid .env file.",
};

export function validateEnvContent(
	text: string,
): { ok: true } | { ok: false; error: string } {
	if (text.includes("\0")) return INVALID;

	const lines = text.split("\n");
	let kvCount = 0;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();
		i++;

		if (!line || line.startsWith("#")) continue;
		if (!ENV_LINE.test(line)) return INVALID;
		kvCount++;

		// Skip multiline quoted values
		const afterEq = line.slice(line.indexOf("=") + 1).trim();
		const quote = afterEq[0];
		if ((quote === '"' || quote === "'") && !afterEq.endsWith(quote)) {
			while (i < lines.length && !lines[i].trimEnd().endsWith(quote)) {
				i++;
			}
			i++; // skip closing quote line
		}
	}

	if (kvCount === 0) return INVALID;
	return { ok: true };
}

interface EnvEntry {
	key: string;
	value: string;
}

export function parseEnvContent(content: string): EnvEntry[] {
	const entries: EnvEntry[] = [];
	const lines = content.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();
		i++;

		if (!line || line.startsWith("#")) continue;

		const eqIndex = line.indexOf("=");
		if (eqIndex === -1) continue;

		const key = line
			.slice(0, eqIndex)
			.trim()
			.replace(/^export\s+/, "");
		if (!key) continue;

		let value = line.slice(eqIndex + 1).trim();

		// Handle multiline quoted values
		const quote = value[0];
		if ((quote === '"' || quote === "'") && !value.endsWith(quote)) {
			const valueLines = [value.slice(1)];
			while (i < lines.length) {
				const nextLine = lines[i];
				i++;
				if (nextLine.trimEnd().endsWith(quote)) {
					valueLines.push(nextLine.trimEnd().slice(0, -1));
					break;
				}
				valueLines.push(nextLine);
			}
			value = valueLines.join("\n");
		} else if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		entries.push({ key, value });
	}

	return entries;
}
