import { createTool } from "@mastra/core/tools";
import * as cheerio from "cheerio";
import { z } from "zod";

const MAX_CONTENT_BYTES = 50_000;

/** Tags whose content should be removed entirely (not just the tag) */
const REMOVE_TAGS = [
	"script",
	"style",
	"noscript",
	"iframe",
	"svg",
	"nav",
	"footer",
	"header",
];

/** Block requests to private/internal network addresses */
function isBlockedHost(hostname: string): boolean {
	// Normalize
	const h = hostname.toLowerCase();

	// Localhost variants
	if (h === "localhost" || h === "[::1]") return true;

	// IPv4 private/reserved ranges
	if (
		/^127\./.test(h) ||
		/^10\./.test(h) ||
		/^192\.168\./.test(h) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
		/^169\.254\./.test(h) || // link-local
		/^0\./.test(h)
	)
		return true;

	// IPv6 loopback/private (bracket-wrapped or raw)
	const raw = h.replace(/^\[|\]$/g, "");
	if (
		raw === "::1" ||
		raw.startsWith("fe80:") ||
		raw.startsWith("fc00:") ||
		raw.startsWith("fd")
	)
		return true;

	return false;
}

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
		// Validate URL protocol and hostname
		const parsed = new URL(input.url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return {
				content: `Blocked: only http/https URLs are allowed (got ${parsed.protocol})`,
				bytes: 0,
				status_code: 0,
			};
		}
		if (isBlockedHost(parsed.hostname)) {
			return {
				content:
					"Blocked: requests to private/internal network addresses are not allowed",
				bytes: 0,
				status_code: 0,
			};
		}

		const response = await fetch(input.url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (compatible; SupersetAgent/1.0; +https://superset.sh)",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

		const rawText = await response.text();
		let content: string;

		if (contentType.includes("text/html") || contentType.includes("xhtml")) {
			const $ = cheerio.load(rawText);
			for (const tag of REMOVE_TAGS) {
				$(tag).remove();
			}
			// Prefer <article> or <main> content, fall back to <body>
			const main = $("article").length
				? $("article")
				: $("main").length
					? $("main")
					: $("body");
			content = main
				.text()
				.replace(/[ \t]+/g, " ")
				.replace(/\n{3,}/g, "\n\n")
				.trim();
		} else {
			content = rawText;
		}

		const encoded = new TextEncoder().encode(content);
		const bytes = encoded.length;

		if (bytes > MAX_CONTENT_BYTES) {
			content =
				new TextDecoder().decode(encoded.slice(0, MAX_CONTENT_BYTES)) +
				`\n\n[Content truncated — ${bytes} bytes total, showing first ${MAX_CONTENT_BYTES}]`;
		}

		return {
			content,
			bytes,
			status_code: statusCode,
		};
	},
});
