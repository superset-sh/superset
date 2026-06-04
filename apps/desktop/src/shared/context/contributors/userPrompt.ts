import type { ContentPart, ContextContributor, LaunchSource } from "../types";

/**
 * Convenience builder for plain-text prompts. Callers that already have a
 * mixed ContentPart[] (rich editor output, dropped-in images) should pass
 * that directly; this helper is just sugar for the common text-only case.
 */
export function userPromptFromText(
	text: string,
): Extract<LaunchSource, { kind: "user-prompt" }> {
	return { kind: "user-prompt", content: [{ type: "text", text }] };
}

/**
 * Drop empty text parts and trim surrounding whitespace on text parts that
 * bookend the content. File/image parts are kept as-is.
 */
function normalize(content: ContentPart[]): ContentPart[] {
	const normalized: ContentPart[] = [];
	for (const part of content) {
		if (part.type === "text") {
			const text = part.text;
			if (!text.trim()) continue; // drop empty text parts entirely
			normalized.push({ type: "text", text });
		} else {
			normalized.push(part);
		}
	}

	// Trim whitespace on the first and last text parts so leading/trailing
	// whitespace from editor markup doesn't leak through.
	const first = normalized[0];
	if (first?.type === "text") {
		normalized[0] = { type: "text", text: first.text.trimStart() };
	}
	const last = normalized[normalized.length - 1];
	if (last?.type === "text") {
		normalized[normalized.length - 1] = {
			type: "text",
			text: last.text.trimEnd(),
		};
	}
	return normalized;
}

export const userPromptContributor: ContextContributor<{
	kind: "user-prompt";
	content: ContentPart[];
}> = {
	kind: "user-prompt",
	displayName: "Prompt",
	description: "The user's free-form prompt for this launch.",
	requiresQuery: true,
	async resolve(source) {
		const content = normalize(source.content);
		if (content.length === 0) return null;
		return {
			id: "user-prompt",
			kind: "user-prompt",
			label: "Prompt",
			content,
		};
	},
};
