import type { ContextContributor } from "../types";

function basename(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const last = normalized.split("/").filter(Boolean).pop();
	return last ?? path;
}

export const agentInstructionsContributor: ContextContributor<{
	kind: "agent-instructions";
	path: string;
}> = {
	kind: "agent-instructions",
	displayName: "Agent Instructions",
	description:
		"Project-level conventions (AGENTS.md, CLAUDE.md) included as stable system context.",
	requiresQuery: false,
	async resolve(source, ctx) {
		const text = (await ctx.readAgentInstructions(source.path)).trim();
		if (!text) return null;
		return {
			id: `agent-instructions:${source.path}`,
			kind: "agent-instructions",
			scope: "system",
			label: basename(source.path),
			content: [{ type: "text", text }],
			cacheControl: "ephemeral",
		};
	},
};
