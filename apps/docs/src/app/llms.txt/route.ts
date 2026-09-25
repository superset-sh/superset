import { source } from "@/lib/source";

export const revalidate = false;

export function GET() {
	const lines = [
		"# Superset Documentation",
		"",
		"> Official documentation for Superset — run parallel AI coding agents in isolated Git worktrees on your machine.",
		"",
		"Each page is available as markdown at /llms.mdx/<path>. The full corpus is at /llms-full.txt.",
		"",
		"## Pages",
		"",
		...source.getPages().map((page) => {
			const description =
				typeof page.data.description === "string" && page.data.description
					? `: ${page.data.description}`
					: "";
			return `- [${page.data.title}](https://docs.superset.sh${page.url})${description}`;
		}),
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
