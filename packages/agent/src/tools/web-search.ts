import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const resultSchema = z.object({
	results: z.array(
		z.object({
			title: z.string(),
			url: z.string(),
			content: z.string(),
		}),
	),
});

export const webSearchTool = createTool({
	id: "web_search",
	description:
		"Search the web for current information. Returns a list of relevant results with titles, URLs, and content snippets.",
	inputSchema: z.object({
		query: z.string().describe("The search query"),
		maxResults: z
			.number()
			.min(1)
			.max(10)
			.optional()
			.default(5)
			.describe("Maximum number of results to return (1-10)"),
	}),
	outputSchema: resultSchema,
	execute: async (input, context) => {
		const apiUrl = context?.requestContext?.get("apiUrl");
		const authToken = context?.requestContext?.get("authToken");

		if (!apiUrl || !authToken) {
			throw new Error(
				"Web search requires apiUrl and authToken in request context.",
			);
		}

		const response = await fetch(`${apiUrl}/api/chat/tools/web-search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({
				query: input.query,
				maxResults: input.maxResults,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Web search proxy returned ${response.status}: ${await response.text()}`,
			);
		}

		return resultSchema.parse(await response.json());
	},
});
