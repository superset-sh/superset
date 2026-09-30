import { describe, expect, it } from "bun:test";
import { getPullRequestTarget } from "./getPullRequestTarget";

const projects = [
	{ projectKey: "other", repoOwner: "other", repoName: "repo" },
	{ projectKey: "matching", repoOwner: "superset-sh", repoName: "superset" },
];
const ref = {
	repoFullName: "superset-sh/superset",
	number: 42,
	provider: "github",
	instance: "https://github.com",
	repoPath: "superset-sh/superset",
} as const;

describe("getPullRequestTarget", () => {
	it.each([
		"",
		"/",
		"/files",
		"/commits/abc",
		"/checks",
		"?x=1#discussion_r42",
	])("matches PR pages and subpages: %s", (suffix) => {
		expect(
			getPullRequestTarget(
				`https://github.com/superset-sh/superset/pull/42${suffix}`,
				projects,
			),
		).toEqual({ ref, projectId: "matching" });
	});

	it("matches the project case-insensitively and keeps the URL's spelling", () => {
		expect(
			getPullRequestTarget(
				"https://github.com/SUPERSET-SH/Superset/pull/42",
				projects,
			),
		).toEqual({
			ref: {
				...ref,
				repoFullName: "SUPERSET-SH/Superset",
				repoPath: "SUPERSET-SH/Superset",
			},
			projectId: "matching",
		});
	});

	it.each([
		"about:blank",
		"https://github.com/superset-sh/superset/issues/42",
		"https://github.com/superset-sh/superset/pulls",
		"https://github.com/superset-sh/superset/pull/new",
		"https://github.com/superset-sh/superset/pull/42oops",
		"https://github.com.evil.com/superset-sh/superset/pull/42",
		"https://example.com/superset-sh/superset/pull/42",
	])("is not a pull request: %s", (url) => {
		expect(getPullRequestTarget(url, projects)).toBeNull();
	});

	it("names the pull request even when no project has its repository", () => {
		expect(
			getPullRequestTarget(
				"https://github.com/untracked/repo/pull/42",
				projects,
			),
		).toEqual({
			ref: {
				...ref,
				repoFullName: "untracked/repo",
				repoPath: "untracked/repo",
			},
			projectId: null,
		});
		expect(
			getPullRequestTarget(
				"https://github.com/superset-sh/superset/pull/42",
				[],
			),
		).toEqual({ ref, projectId: null });
	});

	it("matches a nested GitLab project on the correct instance", () => {
		const gitlabProjects = [
			{
				projectKey: "other-instance",
				repoOwner: "org/group",
				repoName: "app",
				provider: "gitlab" as const,
				instance: "https://other.example.com",
			},
			{
				projectKey: "matching-gitlab",
				repoOwner: "org/group",
				repoName: "app",
				provider: "gitlab" as const,
				instance: "https://gitlab.example.com:8443",
			},
		];
		expect(
			getPullRequestTarget(
				"https://gitlab.example.com:8443/org/group/app/-/merge_requests/42",
				gitlabProjects,
			),
		).toEqual({
			ref: {
				provider: "gitlab",
				instance: "https://gitlab.example.com:8443",
				repoPath: "org/group/app",
				repoFullName: "org/group/app",
				number: 42,
			},
			projectId: "matching-gitlab",
		});
	});

	it("returns the serving host for otherwise identical GitLab project IDs", () => {
		const target = getPullRequestTarget(
			"https://gitlab-b.example.com/org/group/app/-/merge_requests/42",
			[
				{
					projectKey: "shared-id",
					hostId: "host-a",
					repoOwner: "org/group",
					repoName: "app",
					provider: "gitlab",
					instance: "https://gitlab-a.example.com",
				},
				{
					projectKey: "shared-id",
					hostId: "host-b",
					repoOwner: "org/group",
					repoName: "app",
					provider: "gitlab",
					instance: "https://gitlab-b.example.com",
				},
			],
		);
		expect(target?.projectId).toBe("shared-id");
		expect(target?.hostId).toBe("host-b");
	});
});
