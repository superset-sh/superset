import type { SessionConfigOption } from "@superset/chat/protocol";

/**
 * "Sonnet 5.5" for `claude-sonnet-5-5`: the agent's own label when its model
 * list has the id, else the id read as a name — vendor prefix and date
 * suffix dropped, the version dotted.
 */
export function modelDisplayName(
	model: string,
	configOptions: readonly SessionConfigOption[] = [],
): string {
	for (const option of configOptions) {
		if (option.category !== "model") continue;
		const entry = option.options.find((candidate) => candidate.id === model);
		if (entry) return entry.label;
	}
	const parts = model
		.replace(/^(?:claude|gpt|anthropic\.|openai\/)-?/i, "")
		.split(/[-_]/)
		.filter((part) => part && !/^\d{8}$/.test(part));
	const words: string[] = [];
	for (const part of parts) {
		const last = words.at(-1);
		if (/^\d+$/.test(part) && last && /^\d+(?:\.\d+)*$/.test(last)) {
			words[words.length - 1] = `${last}.${part}`;
		} else {
			words.push(part);
		}
	}
	return words
		.map((word) =>
			/^\d/.test(word) ? word : word[0]?.toUpperCase() + word.slice(1),
		)
		.join(" ");
}
