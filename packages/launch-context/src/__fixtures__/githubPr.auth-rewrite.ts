import type { GitHubPullRequestContent } from "../types";

export const githubPrAuthRewrite: GitHubPullRequestContent = {
	number: 200,
	url: "https://github.com/acme/repo/pull/200",
	title: "Rewrite auth middleware",
	body: "Replaces plaintext token storage with encrypted KV.",
	branch: "fix/auth-encryption",
};
