import { lookup } from "node:dns/promises";
import { createTool } from "@mastra/core/tools";
import * as cheerio from "cheerio";
import { z } from "zod";

const MAX_CONTENT_BYTES = 50_000;
const MAX_REDIRECTS = 10;

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

function isPrivateAddress(addr: string): boolean {
	const h = addr.toLowerCase().replace(/^\[|\]$/g, "");

	if (h === "localhost" || h === "::1") return true;

	if (
		/^127\./.test(h) ||
		/^10\./.test(h) ||
		/^192\.168\./.test(h) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
		/^169\.254\./.test(h) || // link-local
		/^0\./.test(h)
	)
		return true;

	if (
		h.startsWith("fe80:") ||
		h.startsWith("fc00:") ||
		/^fd[0-9a-f]{2}:/i.test(h) // ULA fd00::/8, avoids false positives on domains like fd.dev
	)
		return true;

	return false;
}

/** Check hostname string AND resolve DNS to prevent SSRF via DNS rebinding */
async function isBlockedHost(hostname: string): Promise<boolean> {
	if (isPrivateAddress(hostname)) return true;

	try {
		const addresses = await lookup(hostname, { all: true });
		if (addresses.some((a) => isPrivateAddress(a.address))) return true;
	} catch {
		// DNS resolution failure — allow the fetch to fail naturally
	}

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
		const blocked = (msg: string) => ({
			content: msg,
			bytes: 0,
			status_code: 0,
		});

		const validateUrl = async (url: string) => {
			const parsed = new URL(url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return `Blocked: only http/https URLs are allowed (got ${parsed.protocol})`;
			}
			if (await isBlockedHost(parsed.hostname)) {
				return "Blocked: requests to private/internal network addresses are not allowed";
			}
			return null;
		};

		const blockReason = await validateUrl(input.url);
		if (blockReason) return blocked(blockReason);

		let url = input.url;
		let response: Response;
		let redirects = 0;

		// Follow redirects manually so we can SSRF-check each hop before requesting
		while (true) {
			response = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (compatible; SupersetAgent/1.0; +https://superset.sh)",
					Accept:
						"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				},
				redirect: "manual",
				signal: AbortSignal.timeout(15_000),
			});

			const location = response.headers.get("location");
			if (response.status >= 300 && response.status < 400 && location) {
				if (++redirects > MAX_REDIRECTS) {
					return blocked("Blocked: too many redirects");
				}
				const nextUrl = new URL(location, url).toString();
				const redirectBlockReason = await validateUrl(nextUrl);
				if (redirectBlockReason) return blocked(redirectBlockReason);
				url = nextUrl;
				continue;
			}
			break;
		}

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
