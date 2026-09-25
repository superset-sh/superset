import { COMPANY } from "@superset/shared/constants";
import { getBlogPosts } from "@/lib/blog";

export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;
	const posts = getBlogPosts();

	const lines = [
		`# ${COMPANY.NAME} Blog`,
		"",
		`> Articles from the ${COMPANY.NAME} team on parallel coding agents, Git worktrees, and agent orchestration.`,
		"",
		"Append `.md` to any post URL for a markdown version.",
		"",
		"## Posts",
		"",
		...posts.map(
			(post) =>
				`- [${post.title}](${baseUrl}/blog/${post.slug})${post.description ? `: ${post.description}` : ""}`,
		),
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
