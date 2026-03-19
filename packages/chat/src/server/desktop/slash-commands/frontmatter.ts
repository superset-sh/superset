interface SlashCommandFrontmatter {
	description: string;
	argumentHint: string;
	aliases: string[];
}

function createEmptyFrontmatter(): SlashCommandFrontmatter {
	return {
		description: "",
		argumentHint: "",
		aliases: [],
	};
}

function parseQuotedValue(rawValue: string): string {
	if (
		rawValue.length >= 2 &&
		rawValue.startsWith('"') &&
		rawValue.endsWith('"')
	) {
		try {
			return JSON.parse(rawValue) as string;
		} catch {
			return rawValue.slice(1, -1);
		}
	}

	if (
		rawValue.length >= 2 &&
		rawValue.startsWith("'") &&
		rawValue.endsWith("'")
	) {
		return rawValue.slice(1, -1).replace(/''/g, "'");
	}

	return rawValue;
}

function parseFrontmatterBlock(raw: string): Map<string, string> {
	if (!raw.startsWith("---")) return new Map();

	const lines = raw.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return new Map();

	let endIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") {
			endIndex = i;
			break;
		}
	}

	if (endIndex === -1) return new Map();

	const metadata = new Map<string, string>();
	for (let i = 1; i < endIndex; i++) {
		const line = lines[i]?.trim() ?? "";
		if (!line || line.startsWith("#")) continue;

		const separatorIndex = line.indexOf(":");
		if (separatorIndex <= 0) continue;

		const key = line.slice(0, separatorIndex).trim().toLowerCase();
		const rawValue = line.slice(separatorIndex + 1).trim();
		metadata.set(key, parseQuotedValue(rawValue));
	}

	return metadata;
}

function parseAliasesValue(rawValue: string | undefined): string[] {
	if (!rawValue) return [];

	const normalized = rawValue.trim();
	if (!normalized) return [];

	const listValue =
		normalized.startsWith("[") && normalized.endsWith("]")
			? normalized.slice(1, -1)
			: normalized;

	const values: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;

	for (let i = 0; i < listValue.length; i++) {
		const character = listValue[i];
		if (character === undefined) continue;

		if (quote) {
			if (escaping) {
				current += character;
				escaping = false;
				continue;
			}

			if (character === "\\") {
				escaping = true;
				current += character;
				continue;
			}

			if (character === quote) {
				quote = null;
				current += character;
				continue;
			}

			current += character;
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			current += character;
			continue;
		}

		if (character === ",") {
			values.push(current.trim());
			current = "";
			continue;
		}

		current += character;
	}

	if (current.trim() || values.length > 0) {
		values.push(current.trim());
	}

	return values
		.map((item) => parseQuotedValue(item.trim()))
		.map((item) => item.replace(/^\//, ""))
		.filter((item) => item.length > 0);
}

export function parseSlashCommandFrontmatter(
	raw: string,
): SlashCommandFrontmatter {
	const metadata = parseFrontmatterBlock(raw);

	if (metadata.size === 0) return createEmptyFrontmatter();

	return {
		description: metadata.get("description") ?? "",
		argumentHint:
			metadata.get("argument-hint") ?? metadata.get("argument_hint") ?? "",
		aliases: parseAliasesValue(
			metadata.get("aliases") ?? metadata.get("alias"),
		),
	};
}
