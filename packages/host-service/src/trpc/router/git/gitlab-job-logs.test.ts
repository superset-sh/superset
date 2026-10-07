import { expect, mock, test } from "bun:test";
import { GitLabProviderClient } from "../../../runtime/repo-providers/gitlab/gitlab-provider-client";
import type { HostServiceContext } from "../../../types";
import { gitLabJobLogs } from "./gitlab-actions";

test("fork job logs carry the selected MR proof to the numeric verified source", async () => {
	const repo = {
		provider: "gitlab" as const,
		host: "gitlab.com",
		owner: "team",
		name: "repo",
		url: "https://gitlab.com/team/repo",
		repoPath: "/fixture",
		remoteName: "origin",
	};
	const calls: Array<{ path: string; proof: string | null }> = [];
	const token = mock(async () => {
		throw new Error("Provider credential must not leave the broker");
	});
	const request = async (path: string, init: RequestInit) => {
		calls.push({
			path,
			proof: new Headers(init.headers).get("x-superset-gitlab-merge-request"),
		});
		if (path === "/projects/team%2Frepo")
			return Response.json({
				id: 1,
				path_with_namespace: "team/repo",
				http_url_to_repo: "https://gitlab.com/team/repo.git",
			});
		if (path === "/projects/team%2Frepo/merge_requests/7")
			return Response.json({
				iid: 7,
				target_project_id: 1,
				source_project_id: 42,
				source_branch: "feature",
				target_branch: "main",
				sha: "a".repeat(40),
				title: "Fixture",
				state: "opened",
				web_url: "https://gitlab.com/team/repo/-/merge_requests/7",
			});
		if (path === "/projects/42")
			return Response.json({
				id: 42,
				path_with_namespace: "fork/sub/repo",
				http_url_to_repo: "https://gitlab.com/fork/sub/repo.git",
			});
		if (path === "/projects/42/jobs/8/trace")
			return new Response("fixture fork job log");
		throw new Error(`Unexpected fixture route ${path}`);
	};
	const credentials = {
		getToken: token,
		getGitLabRequest: () => request,
		getCredentials: async () => ({ env: {} }),
		credentialRemedy: () => "",
	};
	const ctx = { credentials } as unknown as HostServiceContext;
	const client = new GitLabProviderClient({ host: repo.host, token, request });
	expect(
		await gitLabJobLogs(
			ctx,
			{ repo, client },
			"https://gitlab.com/fork/sub/repo/-/jobs/8",
			7,
		),
	).toEqual({ logs: "fixture fork job log" });
	expect(calls.filter((call) => call.path.startsWith("/projects/42"))).toEqual([
		{ path: "/projects/42", proof: "7" },
		{ path: "/projects/42/jobs/8/trace", proof: "7" },
	]);
	expect(token).not.toHaveBeenCalled();
	await expect(
		gitLabJobLogs(
			ctx,
			{ repo, client },
			"https://gitlab.com/foreign/repo/-/jobs/8",
			7,
		),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(calls.filter((call) => call.path.endsWith("/trace"))).toHaveLength(1);
});
