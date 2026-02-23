interface SlashCommandFrontmatter {
	description: string;
	argumentHint: string;
	aliases: string[];
}

const EMPTY_FRONTMATTER: SlashCommandFrontmatter = {
	description: "",
	argumentHint: "",
	aliases: [],
};

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

	return listValue
		.split(",")
		.map((item) => item.trim())
		.map((item) => {
			if (
				item.length >= 2 &&
				((item.startsWith('"') && item.endsWith('"')) ||
					(item.startsWith("'") && item.endsWith("'")))
			) {
				return item.slice(1, -1);
			}
			return item;
		})
		.map((item) => item.replace(/^\//, ""))
		.filter((item) => item.length > 0);
}

export function parseSlashCommandFrontmatter(
	raw: string,
): SlashCommandFrontmatter {
	const metadata = parseFrontmatterBlock(raw);

	if (metadata.size === 0) return EMPTY_FRONTMATTER;

	return {
		description: metadata.get("description") ?? "",
		argumentHint:
			metadata.get("argument-hint") ?? metadata.get("argument_hint") ?? "",
		aliases: parseAliasesValue(
			metadata.get("aliases") ?? metadata.get("alias"),
		),
	};
}
