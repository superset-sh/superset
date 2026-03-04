import { COMPANY } from "@superset/shared/constants";
import { getBlogPosts } from "@/lib/blog";
import { getComparisonPages } from "@/lib/compare";
import { FAQ_ITEMS } from "../components/FAQSection/constants";

function stripMdxSyntax(content: string): string {
	return (
		content
			// Remove import statements
			.replace(/^import\s+.*$/gm, "")
			// Remove JSX component tags (e.g. <Video ... />, <Component>...</Component>)
			.replace(/<[A-Z]\w*\b[^>]*\/>/g, "")
			.replace(/<[A-Z]\w*\b[^>]*>[\s\S]*?<\/[A-Z]\w*>/g, "")
			// Clean up excessive blank lines
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

export async function GET() {
	const posts = getBlogPosts();
	const comparisons = getComparisonPages();
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const sections: string[] = [];

	// Header section (same as llms.txt)
	sections.push(
		[
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
		].join("\n"),
	);

	// Comparison pages - full content
	if (comparisons.length > 0) {
		sections.push(
			[
				"---",
				"",
				"# Comparisons",
				"",
				...comparisons.flatMap((page) => [
					`## ${page.title}`,
					"",
					`URL: ${baseUrl}/compare/${page.slug}`,
					"",
					stripMdxSyntax(page.content),
					"",
				]),
			].join("\n"),
		);
	}

	// Blog posts - full content
	if (posts.length > 0) {
		sections.push(
			[
				"---",
				"",
				"# Blog Posts",
				"",
				...posts.flatMap((post) => [
					`## ${post.title}`,
					"",
					`URL: ${baseUrl}/blog/${post.slug}`,
					`Date: ${post.date}`,
					`Author: ${post.author.name}`,
					"",
					stripMdxSyntax(post.content),
					"",
				]),
			].join("\n"),
		);
	}

	// FAQ section
	sections.push(
		[
			"---",
			"",
			"# FAQ",
			"",
			...FAQ_ITEMS.flatMap((item) => [
				`## ${item.question}`,
				"",
				item.answer,
				"",
			]),
		].join("\n"),
	);

	const content = sections.join("\n\n");

	return new Response(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
