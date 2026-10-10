import { DOCS_BASE_URL } from "@/lib/docs-mcp-server";
import { source } from "@/lib/source";

export const revalidate = false;

export function GET() {
	const lines = [
		"# Superset Documentation",
		"",
		"> Official documentation for Superset — run parallel AI coding agents in isolated Git worktrees on your machine.",
		"",
		"Fetch the relevant Markdown pages linked below. Each page includes its source URL and description, followed by the full documentation content.",
		"",
		`Any documentation page is available as Markdown at ${DOCS_BASE_URL}/llms.mdx/<path>, for example ${DOCS_BASE_URL}/llms.mdx/cli/getting-started.`,
		"",
		`The full documentation corpus is available at ${DOCS_BASE_URL}/llms-full.txt.`,
		"",
		"## Pages",
		"",
		...source.getPages().map((page) => {
			const description =
				typeof page.data.description === "string" && page.data.description
					? `: ${page.data.description}`
					: "";
			return `- [${page.data.title}](${DOCS_BASE_URL}/llms.mdx${page.url})${description}`;
		}),
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
