import type { ContextContributor, GitHubIssueContent } from "../types";

function isNotFound(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"status" in err &&
		(err as { status: number }).status === 404
	);
}

export const githubIssueContributor: ContextContributor<{
	kind: "github-issue";
	url: string;
}> = {
	kind: "github-issue",
	displayName: "GitHub Issue",
	description: "Full issue body fetched and inlined as context.",
	requiresQuery: true,
	async resolve(source, ctx) {
		let issue: GitHubIssueContent;
		try {
			issue = await ctx.fetchIssue(source.url);
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}

		const body = issue.body.trim();
		const heading = `# GitHub Issue #${issue.number} — ${issue.title}`;
		const text = body ? `${heading}\n\n${body}` : heading;
		return {
			id: `issue:${issue.number}`,
			kind: "github-issue",
			label: `Issue #${issue.number} — ${issue.title}`,
			content: [{ type: "text", text }],
			meta: { url: issue.url, taskSlug: issue.slug },
		};
	},
};
