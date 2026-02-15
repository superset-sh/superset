import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const askUserQuestionTool = createTool({
	id: "ask_user_question",
	description:
		"Present structured questions with options to the user and get their answers. Use when you need clarification, the user needs to choose between options, or you want to confirm an approach before proceeding.",
	requireApproval: true,
	inputSchema: z.object({
		questions: z.array(
			z.object({
				question: z
					.string()
					.describe("The question to ask the user. Should end with ?"),
				header: z
					.string()
					.optional()
					.describe("Short label displayed as a chip/tag (max 12 chars)"),
				options: z
					.array(
						z.object({
							label: z
								.string()
								.describe("Display text for this option (1-5 words)"),
							description: z
								.string()
								.optional()
								.describe("Explanation of what this option means"),
						}),
					)
					.min(2)
					.max(4)
					.describe("Available choices (2-4 options)"),
				multiSelect: z
					.boolean()
					.optional()
					.default(false)
					.describe("Allow multiple selections"),
			}),
		),
	}),
	outputSchema: z.object({
		answers: z.record(z.string(), z.string()),
	}),
	execute: async (_input, context) => {
		// After approval, answers are injected into RequestContext by the tRPC router
		const raw = context?.requestContext?.get("toolAnswers") as
			| string
			| undefined;
		if (raw) {
			try {
				const answers = JSON.parse(raw) as Record<string, string>;
				return { answers };
			} catch {
				return { answers: {} };
			}
		}
		return { answers: {} };
	},
});
