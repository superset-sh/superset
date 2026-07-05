import type { GitHubIssueContent } from "../types";

export const githubIssueAuthMiddleware: GitHubIssueContent = {
	number: 123,
	url: "https://github.com/acme/repo/issues/123",
	title: "Auth middleware stores tokens in plaintext",
	body: "Legal flagged this. Sessions written to disk without encryption.",
	slug: "auth-middleware-stores-tokens-in-plaintext",
};

export const githubIssueTokenRotation: GitHubIssueContent = {
	number: 124,
	url: "https://github.com/acme/repo/issues/124",
	title: "Rotate session tokens on password change",
	body: "Follow-up for #123.",
	slug: "rotate-session-tokens-on-password-change",
};
