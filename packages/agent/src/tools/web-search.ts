import { createTool } from "@mastra/core/tools";
import { tavily } from "@tavily/core";
import { z } from "zod";

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
	outputSchema: z.object({
		results: z.array(
			z.object({
				title: z.string(),
				url: z.string(),
				content: z.string(),
			}),
		),
	}),
	execute: async (input) => {
		const apiKey = process.env.TAVILY_API_KEY;
		if (!apiKey) {
			throw new Error(
				"TAVILY_API_KEY environment variable is not set. Web search is unavailable.",
			);
		}

		const client = tavily({ apiKey });
		const response = await client.search(input.query, {
			maxResults: input.maxResults,
		});

		return {
			results: response.results.map((r) => ({
				title: r.title,
				url: r.url,
				content: r.content,
			})),
		};
	},
});
