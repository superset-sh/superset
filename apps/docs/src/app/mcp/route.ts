import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getLLMText, source } from "@/lib/source";

function createDocsMcpServer(): McpServer {
	const server = new McpServer({ name: "superset-docs", version: "1.0.0" });

	server.registerTool(
		"docs_search",
		{
			description:
				"Search the Superset documentation by keyword. Returns matching pages with path, title, and description. Use docs_read to fetch a page's full content.",
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
					const description =
						typeof page.data.description === "string"
							? page.data.description
							: "";
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
				}));

			return {
				content: [{ type: "text", text: JSON.stringify(matches, null, 1) }],
			};
		},
	);

	server.registerTool(
		"docs_read",
		{
			description:
				"Read one Superset documentation page as markdown. Pass the path from docs_search (e.g. /mcp-server, /cli/getting-started).",
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
							text: `No page at ${path}. Available: ${available}`,
						},
					],
				};
			}
			return { content: [{ type: "text", text: await getLLMText(page) }] };
		},
	);

	return server;
}

async function handleMcp(request: Request): Promise<Response> {
	const server = createDocsMcpServer();
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);
	return transport.handleRequest(request);
}

export async function GET(request: Request): Promise<Response> {
	const accept = request.headers.get("accept") ?? "";
	if (accept.includes("text/event-stream")) {
		return handleMcp(request);
	}
	// Humans land here from old links to the /mcp docs page.
	return Response.redirect(new URL("/mcp-server", request.url), 308);
}

export { handleMcp as POST, handleMcp as DELETE };

export const maxDuration = 60;
