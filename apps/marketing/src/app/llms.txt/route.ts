import { COMPANY } from "@superset/shared/constants";
import { getBlogPosts } from "@/lib/blog";
import { getComparisonPages } from "@/lib/compare";
import { FAQ_ITEMS } from "../components/FAQSection/constants";

export async function GET() {
	const posts = getBlogPosts();
	const comparisons = getComparisonPages();
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const lines: string[] = [
		`# ${COMPANY.NAME}`,
		"",
		"> Run 10+ parallel coding agents on your machine",
		"",
		`${COMPANY.NAME} is an open-source desktop application that lets developers run multiple AI coding agents in parallel, each in its own isolated Git worktree. It works with any CLI-based agent including Claude Code, OpenCode, and OpenAI Codex. Agents can work on different branches or features simultaneously without conflicts. ${COMPANY.NAME} is free, does not proxy API calls, and supports macOS with Windows and Linux coming soon.`,
		"",
		"## Docs",
		"",
		`- [Documentation](${docsUrl})`,
		`- [Getting Started](${docsUrl}/getting-started)`,
		`- [GitHub](${COMPANY.GITHUB_URL})`,
		"",
		"## Blog",
		"",
		...posts.map((post) => `- [${post.title}](${baseUrl}/blog/${post.slug})`),
		"",
		"## Comparisons",
		"",
		...comparisons.map(
			(page) => `- [${page.title}](${baseUrl}/compare/${page.slug})`,
		),
		"",
		"## FAQ",
		"",
		...FAQ_ITEMS.flatMap((item) => [
			`### ${item.question}`,
			"",
			item.answer,
			"",
		]),
	];

	const content = lines.join("\n");

	return new Response(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
