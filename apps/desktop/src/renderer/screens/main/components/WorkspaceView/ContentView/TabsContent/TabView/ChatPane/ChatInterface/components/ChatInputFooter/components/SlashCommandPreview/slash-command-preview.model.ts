export interface NamedArgEntry {
	keyRaw: string;
	keyUpper: string;
	value: string;
}

export interface ParsedSlashInput {
	commandName: string;
	commandToken: string;
	positionalTokens: string[];
	namedEntries: NamedArgEntry[];
}

export interface ParamField {
	id: string;
	kind: "named" | "positional";
	label: string;
	required: boolean;
	namedKeyUpper?: string;
	positionalIndex?: number;
}

function getSlashCommandToken(input: string): string {
	const match = input.match(/^\/[^\s]+/);
	return match?.[0] ?? input;
}

function tokenizeSlashArguments(argumentsRaw: string): string[] {
	if (!argumentsRaw) return [];

	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;

	for (let i = 0; i < argumentsRaw.length; i++) {
		const character = argumentsRaw[i];
		if (character === undefined) continue;

		if (quote) {
			if (escaping) {
				current += character;
				escaping = false;
				continue;
			}

			if (character === "\\") {
				escaping = true;
				continue;
			}

			if (character === quote) {
				quote = null;
				continue;
			}

			current += character;
			continue;
		}

		if (/\s/.test(character)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === "\\") {
			const nextCharacter = argumentsRaw[i + 1];
			if (nextCharacter !== undefined) {
				current += nextCharacter;
				i += 1;
				continue;
			}
		}

		current += character;
	}

	if (escaping) {
		current += "\\";
	}
	if (current) {
		tokens.push(current);
	}

	return tokens;
}

function parseNamedArgToken(token: string): NamedArgEntry | null {
	const match = token.match(/^(?:--?)?([A-Za-z_][\w-]*)=(.*)$/);
	if (!match) return null;

	const keyRaw = match[1];
	const value = match[2];
	if (keyRaw === undefined || value === undefined) return null;

	return {
		keyRaw,
		keyUpper: normalizeNamedKey(keyRaw),
		value,
	};
}

function normalizeNamedKey(rawKey: string): string {
	return rawKey.replace(/-/g, "_").toUpperCase();
}

function quoteArgumentToken(token: string): string {
	if (!token) return '""';
	if (!/[\s"\\]/.test(token)) return token;
	return `"${token.replace(/(["\\])/g, "\\$1")}"`;
}

function formatFieldLabel(key: string): string {
	return key.toLowerCase().replaceAll("_", " ").replaceAll("-", " ").trim();
}

function mergeParamField(
	fieldById: Map<string, ParamField>,
	field: ParamField,
): void {
	const existing = fieldById.get(field.id);
	if (!existing) {
		fieldById.set(field.id, field);
		return;
	}
	fieldById.set(field.id, {
		...existing,
		required: existing.required || field.required,
	});
}

function extractParamFieldsFromHint(argumentHint: string): ParamField[] {
	if (!argumentHint.trim()) return [];

	const fieldById = new Map<string, ParamField>();
	let nextPositionalIndex = 0;

	const registerHintSegment = (segment: string, required: boolean) => {
		for (const match of segment.matchAll(/(?:--?)?([A-Za-z_][\w-]*)\s*=/g)) {
			const rawKey = match[1];
			if (!rawKey) continue;
			const namedKeyUpper = normalizeNamedKey(rawKey);
			mergeParamField(fieldById, {
				id: `named:${namedKeyUpper}`,
				kind: "named",
				label: formatFieldLabel(rawKey),
				required,
				namedKeyUpper,
			});
		}

		for (const match of segment.matchAll(/<([^>]+)>/g)) {
			const rawLabel = match[1]?.trim();
			if (!rawLabel) continue;
			mergeParamField(fieldById, {
				id: `pos:${nextPositionalIndex}`,
				kind: "positional",
				label: formatFieldLabel(rawLabel),
				required,
				positionalIndex: nextPositionalIndex,
			});
			nextPositionalIndex += 1;
		}
	};

	for (const optionalMatch of argumentHint.matchAll(/\[([^[\]]+)\]/g)) {
		const optionalSegment = optionalMatch[1] ?? "";
		registerHintSegment(optionalSegment, false);
	}

	const requiredSegment = argumentHint.replace(/\[[^[\]]+\]/g, " ");
	registerHintSegment(requiredSegment, true);

	return [...fieldById.values()];
}

function mergeUnresolvedNamedFields(
	fields: ParamField[],
	unresolvedFieldKeys: string[],
	parsed: ParsedSlashInput | null,
): ParamField[] {
	if (unresolvedFieldKeys.length === 0) return fields;

	const fieldById = new Map(fields.map((field) => [field.id, field] as const));
	const existingNamedRawByUpper = new Map<string, string>();
	for (const entry of parsed?.namedEntries ?? []) {
		existingNamedRawByUpper.set(entry.keyUpper, entry.keyRaw);
	}

	for (const keyUpper of unresolvedFieldKeys) {
		mergeParamField(fieldById, {
			id: `named:${keyUpper}`,
			kind: "named",
			label: formatFieldLabel(keyUpper),
			required: true,
			namedKeyUpper: keyUpper,
		});
	}

	return [...fieldById.values()];
}

function mergeParsedNamedFields(
	fields: ParamField[],
	parsed: ParsedSlashInput | null,
): ParamField[] {
	if (!parsed?.namedEntries.length) return fields;

	const fieldById = new Map(fields.map((field) => [field.id, field] as const));
	for (const entry of parsed.namedEntries) {
		mergeParamField(fieldById, {
			id: `named:${entry.keyUpper}`,
			kind: "named",
			label: formatFieldLabel(entry.keyRaw),
			required: false,
			namedKeyUpper: entry.keyUpper,
		});
	}

	return [...fieldById.values()];
}

export function normalizeSlashPreviewInput(input: string): string {
	const normalized = input.replace(/^\s+/, "");
	return normalized.startsWith("/") ? normalized : "";
}

export function parseSlashInput(input: string): ParsedSlashInput | null {
	const normalized = normalizeSlashPreviewInput(input);
	if (!normalized) return null;

	const commandToken = getSlashCommandToken(normalized);
	if (!commandToken) return null;

	const commandName = commandToken.replace(/^\//, "").trim();
	if (!commandName) return null;

	const argumentsRaw = normalized.slice(commandToken.length).trim();
	const argumentTokens = tokenizeSlashArguments(argumentsRaw);

	const positionalTokens: string[] = [];
	const namedEntries: NamedArgEntry[] = [];
	for (const token of argumentTokens) {
		const named = parseNamedArgToken(token);
		if (named) {
			namedEntries.push(named);
			continue;
		}
		positionalTokens.push(token);
	}

	return {
		commandName,
		commandToken,
		positionalTokens,
		namedEntries,
	};
}

export function buildNextSlashInput(
	parsed: ParsedSlashInput,
	field: ParamField,
	value: string,
): string {
	const namedUpdates = new Map<string, string>();
	const positionalUpdates = new Map<number, string>();
	if (field.kind === "named" && field.namedKeyUpper) {
		namedUpdates.set(field.namedKeyUpper, value);
	}
	if (field.kind === "positional" && field.positionalIndex !== undefined) {
		positionalUpdates.set(field.positionalIndex, value);
	}

	const positionalTokens = [...parsed.positionalTokens];
	for (const [index, nextValue] of positionalUpdates) {
		if (index < 0) continue;
		while (positionalTokens.length <= index) {
			positionalTokens.push("");
		}
		positionalTokens[index] = nextValue;
	}

	while (
		positionalTokens.length > 0 &&
		!positionalTokens[positionalTokens.length - 1]
	) {
		positionalTokens.pop();
	}

	const orderedKeys: string[] = [];
	const namedByKey = new Map<string, { keyRaw: string; value: string }>();
	for (const entry of parsed.namedEntries) {
		if (!orderedKeys.includes(entry.keyUpper)) {
			orderedKeys.push(entry.keyUpper);
		}
		namedByKey.set(entry.keyUpper, {
			keyRaw: entry.keyRaw,
			value: entry.value,
		});
	}

	for (const [key, nextValue] of namedUpdates) {
		if (!nextValue) {
			namedByKey.delete(key);
			continue;
		}
		if (!orderedKeys.includes(key)) {
			orderedKeys.push(key);
		}
		const existing = namedByKey.get(key);
		namedByKey.set(key, {
			keyRaw: existing?.keyRaw ?? key.toLowerCase(),
			value: nextValue,
		});
	}

	const argumentTokens = [
		...positionalTokens.map(quoteArgumentToken),
		...orderedKeys.flatMap((key) => {
			const named = namedByKey.get(key);
			if (!named) return [];
			return [`${named.keyRaw}=${quoteArgumentToken(named.value)}`];
		}),
	];

	return [parsed.commandToken, ...argumentTokens].join(" ");
}

export function extractUnresolvedNamedPlaceholders(prompt: string): string[] {
	const matches = prompt.matchAll(
		/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
	);
	const placeholders: string[] = [];
	const seen = new Set<string>();

	for (const match of matches) {
		const name = (match[1] ?? match[2] ?? "").toUpperCase();
		if (!name) continue;
		if (name === "ARGUMENTS" || name === "COMMAND" || name === "CWD") continue;
		if (seen.has(name)) continue;
		seen.add(name);
		placeholders.push(name);
	}

	return placeholders;
}

export function buildParamFields(args: {
	argumentHint: string;
	unresolvedFieldKeys: string[];
	parsed: ParsedSlashInput | null;
}): ParamField[] {
	const fromHint = extractParamFieldsFromHint(args.argumentHint);
	const withUnresolved = mergeUnresolvedNamedFields(
		fromHint,
		args.unresolvedFieldKeys,
		args.parsed,
	);
	return mergeParsedNamedFields(withUnresolved, args.parsed);
}

export function getNamedValueMap(
	parsed: ParsedSlashInput | null,
): Map<string, string> {
	if (!parsed) return new Map();
	const map = new Map<string, string>();
	for (const entry of parsed.namedEntries) {
		map.set(entry.keyUpper, entry.value);
	}
	return map;
}

export function getPositionalValueMap(
	parsed: ParsedSlashInput | null,
): Map<number, string> {
	const map = new Map<number, string>();
	for (const [index, value] of parsed?.positionalTokens.entries() ?? []) {
		map.set(index, value);
	}
	return map;
}

export function getInlinePreviewText(previewPrompt: string): string {
	const firstLine = previewPrompt
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) return "";
	if (firstLine.length <= 96) return firstLine;
	return `${firstLine.slice(0, 93)}...`;
}
