import { describe, expect, it } from "bun:test";
import { getPullRequestTarget } from "./getPullRequestTarget";

const projects = [
	{ projectKey: "other", repoOwner: "other", repoName: "repo" },
	{ projectKey: "matching", repoOwner: "superset-sh", repoName: "superset" },
];
const ref = { repoFullName: "superset-sh/superset", number: 42 };

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
			ref: { repoFullName: "SUPERSET-SH/Superset", number: 42 },
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
			ref: { repoFullName: "untracked/repo", number: 42 },
			projectId: null,
		});
		expect(
			getPullRequestTarget(
				"https://github.com/superset-sh/superset/pull/42",
				[],
			),
		).toEqual({ ref, projectId: null });
	});
});

describe("GitLab project target identity", () => {
	const url = "https://gl.example:8443/team/sub/repo/-/merge_requests/7";
	const ref = {
		provider: "gitlab" as const,
		host: "gl.example:8443",
		repoFullName: "team/sub/repo",
		number: 7,
	};
	const project = {
		projectKey: "correct",
		repoOwner: "team/sub",
		repoName: "repo",
		repoUrl: "https://gl.example:8443/team/sub/repo.git",
	};

	it("uses exact canonical repository URLs instead of the first equal slug", () => {
		expect(
			getPullRequestTarget(url, [
				{
					...project,
					projectKey: "wrong-host",
					repoUrl: "https://other.example/team/sub/repo",
				},
				{
					...project,
					projectKey: "wrong-port",
					repoUrl: "https://gl.example/team/sub/repo",
				},
				{
					...project,
					projectKey: "wrong-case",
					repoUrl: "https://gl.example:8443/Team/sub/repo",
				},
				project,
			]),
		).toEqual({ ref, projectId: "correct" });
	});

	it("accepts the same instance using a stored SSH remote", () => {
		expect(
			getPullRequestTarget(
				"https://gl.example/team/sub/repo/-/merge_requests/7",
				[
					{
						...project,
						repoUrl: "ssh://git@gl.example:2222/team/sub/repo.git",
					},
				],
			),
		).toEqual({ ref: { ...ref, host: "gl.example" }, projectId: "correct" });
	});

	it.each([
		{ ...project, repoUrl: null },
		{ ...project, repoUrl: "https://gl.example:8443/another/repo" },
		{ ...project, repoProvider: "github" },
		{ ...project, repoHost: "other.example" },
		{ ...project, repoOwner: "Team/sub" },
	])("does not guess a project with missing or conflicting identity %#", (row) => {
		expect(getPullRequestTarget(url, [row])).toEqual({ ref, projectId: null });
	});

	it("does not match a GitLab project to an equal GitHub slug", () => {
		expect(
			getPullRequestTarget("https://github.com/team/repo/pull/7", [
				{
					projectKey: "gitlab",
					repoOwner: "team",
					repoName: "repo",
					repoUrl: "https://gl.example/team/repo",
				},
			]),
		).toEqual({
			ref: { repoFullName: "team/repo", number: 7 },
			projectId: null,
		});
	});

	it("matches an SSH checkout to its separately stored canonical HTTPS port", () => {
		expect(
			getPullRequestTarget(url, [
				{
					...project,
					repoHost: "gl.example:8443",
					repoUrl: "git@gl.example:team/sub/repo.git",
				},
			]),
		).toEqual({ ref, projectId: "correct" });
		expect(
			getPullRequestTarget(url, [
				{
					...project,
					repoHost: "gl.example:8443",
					repoUrl: "https://gl.example:9443/team/sub/repo.git",
				},
			]),
		).toEqual({ ref, projectId: null });
	});
	it("uses URL identity when stored names are absent", () => {
		expect(
			getPullRequestTarget(url, [
				{ ...project, repoOwner: null, repoName: null },
			]),
		).toEqual({ ref, projectId: "correct" });
	});

	it.each([
		"https://%67l.example:8443/team/sub/repo.git",
		"https://@gl.example:8443/team/sub/repo.git",
		"https://gl.example:8443/team/sub/repo.git?other=1",
		"https://gl.example:8443/team/sub/repo.git#other",
	])("does not normalize ambiguous stored URL %s into a match", (repoUrl) => {
		expect(getPullRequestTarget(url, [{ ...project, repoUrl }])).toEqual({
			ref,
			projectId: null,
		});
	});

	it("rejects an explicit GitHub URL that contradicts stored names", () => {
		expect(
			getPullRequestTarget("https://github.com/team/repo/pull/7", [
				{
					projectKey: "wrong",
					repoOwner: "team",
					repoName: "repo",
					repoUrl: "https://github.com/other/else.git",
				},
			])?.projectId,
		).toBeNull();
	});
});
