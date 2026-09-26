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
		"Any documentation page is available as Markdown at https://docs.superset.sh/llms.mdx/<path>, for example https://docs.superset.sh/llms.mdx/cli/getting-started.",
		"",
		"The full documentation corpus is available at https://docs.superset.sh/llms-full.txt.",
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
