export function tokenizeSlashCommandArguments(argumentsRaw: string): string[] {
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
