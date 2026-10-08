import type { PluginMentionOption } from "../../types";

function rank(option: PluginMentionOption, query: string): number | null {
	const name = option.name.toLowerCase();
	const displayName = option.displayName.toLowerCase();
	if (name.startsWith(query) || displayName.startsWith(query)) return 0;
	if (name.includes(query) || displayName.includes(query)) return 1;
	if (option.description.toLowerCase().includes(query)) return 2;
	return null;
}

export function matchPluginMentions(
	options: readonly PluginMentionOption[],
	query: string,
): PluginMentionOption[] {
	const normalized = query.trim().toLowerCase();
	if (normalized === "") return [...options];
	return options
		.flatMap((option) => {
			const score = rank(option, normalized);
			return score === null ? [] : [{ option, score }];
		})
		.sort((a, b) => a.score - b.score)
		.map((entry) => entry.option);
}
