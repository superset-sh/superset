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
		const rawAuthHeaders = context?.requestContext?.get("authHeaders");
		const rawAuthToken = context?.requestContext?.get("authToken");
		let authHeaders: Record<string, string> = {};
		const authToken =
			typeof rawAuthToken === "string" ? rawAuthToken : undefined;

		if (typeof rawAuthHeaders === "string") {
			try {
				authHeaders = JSON.parse(rawAuthHeaders) as Record<string, string>;
			} catch (error) {
				console.warn(
					"[web-search] Invalid authHeaders in request context:",
					error,
				);
			}
		}

		if (typeof apiUrl !== "string" || apiUrl.length === 0) {
			throw new Error("Web search requires apiUrl in request context.");
		}
		if (Object.keys(authHeaders).length === 0 && !authToken) {
			throw new Error(
				"Web search requires authHeaders or authToken in request context.",
			);
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			...authHeaders,
		};
		if (!headers.Authorization && authToken) {
			headers.Authorization = `Bearer ${authToken}`;
		}

		const response = await fetch(`${apiUrl}/api/chat/tools/web-search`, {
			method: "POST",
			headers,
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
