import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const answersSchema = z.record(z.string(), z.string());

export const askUserQuestionTool = createTool({
	id: "ask_user_question",
	description:
		"Present structured questions with options to the user and get their answers. Use when you need clarification, the user needs to choose between options, or you want to confirm an approach before proceeding.",
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
		answers: answersSchema,
	}),
	resumeSchema: z.object({
		answers: answersSchema,
	}),
	execute: async (_input, context) => {
		const resumeData = context?.agent?.resumeData as
			| { answers?: Record<string, string> }
			| undefined;

		if (!resumeData) {
			if (context?.agent?.suspend) {
				await context.agent.suspend({});
				return undefined;
			}
			return { answers: {} };
		}

		return { answers: resumeData.answers ?? {} };
	},
});
