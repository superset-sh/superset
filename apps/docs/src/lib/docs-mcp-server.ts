import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLLMText, source } from "@/lib/source";

export const DOCS_BASE_URL = "https://docs.superset.sh";
export const DOCS_MCP_NAME = "superset-docs";
export const DOCS_MCP_VERSION = "1.1.0";

function pageDescription(page: ReturnType<typeof source.getPages>[number]) {
	return typeof page.data.description === "string" ? page.data.description : "";
}

function buildIndex(): string {
	return [
		"# Superset documentation index",
		"",
		...source.getPages().map((page) => {
			const description = pageDescription(page);
			return `- [${page.data.title}](${DOCS_BASE_URL}${page.url})${description ? `: ${description}` : ""}`;
		}),
	].join("\n");
}

export function createDocsMcpServer(): McpServer {
	const server = new McpServer(
		{ name: DOCS_MCP_NAME, version: DOCS_MCP_VERSION },
		{
			instructions:
				"Read-only access to the Superset documentation (docs.superset.sh). Superset runs parallel AI coding agents in isolated Git worktrees. Call docs_search to find pages by keyword, then docs_read to fetch a page as markdown; every page is also exposed as a resource whose URI is its canonical URL. No authentication required; nothing here mutates state. To act on a Superset account (workspaces, agents, tasks), use the product MCP server at https://api.superset.sh/mcp instead.",
		},
	);

	server.registerTool(
		"docs_search",
		{
			title: "Search Superset docs",
			description:
				"Search the Superset documentation by keyword. Returns matching pages with path, title, and description. Use docs_read to fetch a page's full content.",
			annotations: { readOnlyHint: true },
			inputSchema: {
				query: z
					.string()
					.describe(
						"Keywords to match against page titles, descriptions, and body text",
					),
			},
		},
		async ({ query }) => {
			const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
			const pages = await Promise.all(
				source.getPages().map(async (page) => {
					const description = pageDescription(page);
					const body = (await getLLMText(page)).toLowerCase();
					const haystack = `${page.data.title} ${description}`.toLowerCase();
					const score = terms.reduce(
						(sum, term) =>
							sum +
							(haystack.includes(term) ? 2 : 0) +
							(body.includes(term) ? 1 : 0),
						0,
					);
					return { page, description, score };
				}),
			);
			const matches = pages
				.filter((entry) => entry.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, 10)
				.map(({ page, description }) => ({
					path: page.url,
					title: page.data.title,
					description,
					url: `${DOCS_BASE_URL}${page.url}`,
				}));

			return {
				content: [{ type: "text", text: JSON.stringify(matches, null, 1) }],
			};
		},
	);

	server.registerTool(
		"docs_read",
		{
			title: "Read a Superset docs page",
			description:
				"Read one Superset documentation page as markdown. Pass the path from docs_search (e.g. /mcp-server, /cli/getting-started).",
			annotations: { readOnlyHint: true },
			inputSchema: {
				path: z.string().describe("Page path, e.g. /automations"),
			},
		},
		async ({ path }) => {
			const slug = path.replace(/^\//, "").split("/").filter(Boolean);
			const page = source.getPage(slug);
			if (!page) {
				const available = source
					.getPages()
					.map((p) => p.url)
					.join(", ");
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: JSON.stringify({
								code: "NOT_FOUND",
								message: `No documentation page at ${path}.`,
								available,
							}),
						},
					],
				};
			}
			return { content: [{ type: "text", text: await getLLMText(page) }] };
		},
	);

	// Every docs page as a resource, addressed by its canonical URL, plus the
	// index so clients can enumerate without calling a tool.
	server.registerResource(
		"docs-index",
		`${DOCS_BASE_URL}/llms.txt`,
		{
			title: "Superset documentation index",
			description: "Every documentation page with its title and description.",
			mimeType: "text/markdown",
		},
		async (uri) => ({
			contents: [
				{ uri: uri.href, mimeType: "text/markdown", text: buildIndex() },
			],
		}),
	);

	for (const page of source.getPages()) {
		const url = `${DOCS_BASE_URL}${page.url}`;
		server.registerResource(
			`docs${page.url.replace(/\//g, "-") || "-index"}`,
			url,
			{
				title: page.data.title,
				description: pageDescription(page) || undefined,
				mimeType: "text/markdown",
			},
			async (uri) => ({
				contents: [
					{
						uri: uri.href,
						mimeType: "text/markdown",
						text: await getLLMText(page),
					},
				],
			}),
		);
	}

	return server;
}
