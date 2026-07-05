import type { ContextContributor, GitHubPullRequestContent } from "../types";

function isNotFound(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"status" in err &&
		(err as { status: number }).status === 404
	);
}

export const githubPrContributor: ContextContributor<{
	kind: "github-pr";
	url: string;
}> = {
	kind: "github-pr",
	displayName: "GitHub Pull Request",
	description: "Full PR metadata fetched and inlined as context.",
	requiresQuery: true,
	async resolve(source, ctx) {
		let pr: GitHubPullRequestContent;
		try {
			pr = await ctx.fetchPullRequest(source.url);
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}

		const body = pr.body.trim();
		// When a workspace is created from a linked PR, the PR's head
		// branch is checked out into the worktree. Tell the agent so
		// it doesn't start a new branch or open another PR — commits
		// here continue this PR's history.
		const branchLine = pr.branch
			? `This PR is checked out in this workspace on branch \`${pr.branch}\`. Commits you make here will be added to this PR.`
			: "";
		const headerParts = [`# PR #${pr.number} — ${pr.title}`, branchLine].filter(
			Boolean,
		);
		const header = headerParts.join("\n\n");
		const text = body ? `${header}\n\n${body}` : header;
		return {
			id: `pr:${pr.number}`,
			kind: "github-pr",
			label: `PR #${pr.number} — ${pr.title}`,
			content: [{ type: "text", text }],
			meta: { url: pr.url },
		};
	},
};
