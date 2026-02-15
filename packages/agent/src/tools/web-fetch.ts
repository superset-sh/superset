import { Readability } from "@mozilla/readability";
import { createTool } from "@mastra/core/tools";
import { parseHTML } from "linkedom";
import { z } from "zod";

const MAX_CONTENT_BYTES = 50_000;

export const webFetchTool = createTool({
	id: "web_fetch",
	description:
		"Fetch a web page by URL and extract its readable text content. Useful for reading articles, documentation, or any web page.",
	inputSchema: z.object({
		url: z.string().url().describe("The URL to fetch"),
		prompt: z
			.string()
			.optional()
			.describe(
				"Optional prompt describing what information to look for on the page",
			),
	}),
	outputSchema: z.object({
		content: z.string(),
		bytes: z.number(),
		status_code: z.number(),
	}),
	execute: async (input) => {
		const response = await fetch(input.url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (compatible; SupersetAgent/1.0; +https://superset.sh)",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			redirect: "follow",
			signal: AbortSignal.timeout(15_000),
		});

		const statusCode = response.status;
		const contentType = response.headers.get("content-type") ?? "";

		if (!response.ok) {
			return {
				content: `HTTP ${statusCode}: ${response.statusText}`,
				bytes: 0,
				status_code: statusCode,
			};
		}

		const rawHtml = await response.text();
		let content: string;

		if (contentType.includes("text/html") || contentType.includes("xhtml")) {
			const { document } = parseHTML(rawHtml);
			const reader = new Readability(document);
			const article = reader.parse();
			content = article?.textContent?.trim() ?? rawHtml;
		} else {
			content = rawHtml;
		}

		const bytes = new TextEncoder().encode(content).length;

		if (bytes > MAX_CONTENT_BYTES) {
			content =
				content.slice(0, MAX_CONTENT_BYTES) +
				`\n\n[Content truncated — ${bytes} bytes total, showing first ${MAX_CONTENT_BYTES}]`;
		}

		return {
			content,
			bytes,
			status_code: statusCode,
		};
	},
});
