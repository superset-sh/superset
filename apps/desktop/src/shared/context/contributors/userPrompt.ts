import type { ContextContributor } from "../types";

export const userPromptContributor: ContextContributor<{
	kind: "user-prompt";
	text: string;
}> = {
	kind: "user-prompt",
	displayName: "Prompt",
	description: "The user's free-form prompt for this launch.",
	requiresQuery: true,
	async resolve(source) {
		const text = source.text.trim();
		if (!text) return null;
		return {
			id: "user-prompt",
			kind: "user-prompt",
			scope: "user",
			label: "Prompt",
			content: [{ type: "text", text }],
		};
	},
};
