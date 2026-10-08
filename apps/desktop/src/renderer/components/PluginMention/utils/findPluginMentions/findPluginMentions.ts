import type { PluginMentionOption } from "../../types";

const HANDLE = /(^|\s)@([a-z0-9][a-z0-9.-]*)(?![\p{L}\p{M}\p{N}_])/gu;

export interface PluginMentionMatch {
	start: number;
	end: number;
	plugin: PluginMentionOption;
}

/** Ranges of `@name` handles in plain text that name a known plugin. */
export function findPluginMentions(
	text: string,
	resolvePlugin: (name: string) => PluginMentionOption | null,
): PluginMentionMatch[] {
	const matches: PluginMentionMatch[] = [];
	for (const match of text.matchAll(HANDLE)) {
		const name = (match[2] ?? "").replace(/[.-]+$/, "");
		const plugin = resolvePlugin(name);
		if (!plugin) continue;
		const start = (match.index ?? 0) + (match[1]?.length ?? 0);
		matches.push({ start, end: start + 1 + name.length, plugin });
	}
	return matches;
}
