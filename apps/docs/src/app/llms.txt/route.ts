import { source } from "@/lib/source";

export const revalidate = false;

export function GET() {
	const lines = [
		"# Superset Documentation",
		"",
		"> Official documentation for Superset — run parallel AI coding agents in isolated Git worktrees on your machine.",
		"",
		"Start with this index, then fetch the relevant Markdown pages linked below. Read the page before answering and cite its canonical URL (remove /llms.mdx from the Markdown URL).",
		"",
		'For keyword search, connect to the public, read-only MCP server at https://docs.superset.sh/mcp. Call docs_search with {"query":"keywords"}, then docs_read with a returned path, such as {"path":"/troubleshooting"}. No authentication is required.',
		"",
		"The full corpus is at https://docs.superset.sh/llms-full.txt when the index is insufficient. Agent access guide: https://docs.superset.sh/llms.mdx/ask-an-agent.",
		"",
		"## Pages",
		"",
		...source.getPages().map((page) => {
			const description =
				typeof page.data.description === "string" && page.data.description
					? `: ${page.data.description}`
					: "";
			return `- [${page.data.title}](https://docs.superset.sh/llms.mdx${page.url})${description}`;
		}),
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
