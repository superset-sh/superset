import { afterEach, expect, mock, test } from "bun:test";
import { GitLabProviderClient } from "../../../runtime/repo-providers/gitlab/gitlab-provider-client";
import { SandboxGitCredentialProvider } from "./SandboxGitCredentialProvider";

const nativeFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = nativeFetch;
});
const repo = { host: "gitlab.com", owner: "team/sub", name: "repo" };
const repositories = [
	{
		provider: "gitlab" as const,
		url: "https://gitlab.com/team/sub/repo.git",
		branch: "main",
		path: ".",
	},
];
function fixture() {
	const token = mock(async () => "FIXTURE_GITHUB_TOKEN");
	const local = {
		getToken: token,
		getCredentials: async () => ({ env: {} }),
		credentialRemedy: () => "fixture",
	};
	return {
		provider: new SandboxGitCredentialProvider(local, repositories),
		token,
	};
}
test("cloud native reads and writes use intercepted project transport without credential access", async () => {
	const { provider, token } = fixture();
	const requests: Array<{ url: string; init?: RequestInit }> = [];
	globalThis.fetch = mock(async (url, init) => {
		requests.push({ url: String(url), init });
		return Response.json({
			iid: 7,
			description: "issue",
			title: "Fixture",
			web_url: "https://gitlab.com/team/sub/repo/-/issues/7",
			state: "opened",
		});
	}) as unknown as typeof fetch;
	const request = provider.getGitLabRequest(repo);
	expect(request).toBeDefined();
	if (!request) throw new Error("Missing fixture transport");
	const client = new GitLabProviderClient({
		host: repo.host,
		token: () => provider.getToken(repo.host),
		request,
	});
	expect((await client.fetchIssueContent(repo, 7)).body).toBe("issue");
	await request("/projects/team%2Fsub%2Frepo/merge_requests/7/merge", {
		method: "PUT",
		body: "{}",
	});
	expect(requests.map((value) => value.url)).toEqual([
		"https://gitlab.com/api/v4/projects/team%2Fsub%2Frepo/issues/7",
		"https://gitlab.com/api/v4/projects/team%2Fsub%2Frepo/merge_requests/7/merge",
	]);
	expect(
		requests.every(
			(value) => !new Headers(value.init?.headers).has("authorization"),
		),
	).toBe(true);
	expect(token).not.toHaveBeenCalled();
	expect(await provider.getToken("gitlab.com")).toBeNull();
	expect(await provider.getToken("github.com")).toBe("FIXTURE_GITHUB_TOKEN");
});
test("sandbox transport refuses foreign host and project and preserves MR proof only for read paths", async () => {
	const { provider } = fixture();
	expect(
		provider.getGitLabRequest({ ...repo, host: "other.test" }),
	).toBeUndefined();
	expect(
		provider.getGitLabRequest({ ...repo, owner: "other" }),
	).toBeUndefined();
	const request = provider.getGitLabRequest(repo);
	if (!request) throw new Error("Missing fixture transport");
	const fetcher = mock(async () => Response.json({}));
	globalThis.fetch = fetcher as unknown as typeof fetch;
	for (const path of [
		"//evil.test/",
		"/projects/other%2Frepo/issues",
		"/projects/team%252Fsub%252Frepo",
		"/users",
		"/projects/team%2Fsub%2Frepo/../other",
	])
		await expect(request(path, {})).rejects.toThrow();
	await request("/projects/42", {
		headers: { "x-superset-gitlab-merge-request": "7" },
	});
	await expect(
		request("/projects/42", {
			method: "PUT",
			headers: { "x-superset-gitlab-merge-request": "7" },
		}),
	).rejects.toThrow();
	expect(fetcher).toHaveBeenCalledTimes(1);
});

test("native cloud MR, issue search, comment and merge use the scoped provider client", async () => {
	const { provider, token } = fixture();
	const requests: Array<{ url: URL; init?: RequestInit }> = [];
	const mr = {
		iid: 7,
		title: "Fixture MR",
		web_url: "https://gitlab.com/team/sub/repo/-/merge_requests/7",
		state: "opened",
		description: "MR body",
		sha: "fixture-head",
		source_project_id: 1,
		target_project_id: 1,
		source_branch: "feature",
		target_branch: "main",
		draft: false,
	};
	globalThis.fetch = mock(async (input, init) => {
		const url = new URL(String(input));
		requests.push({ url, init });
		if (url.pathname.endsWith("/merge"))
			return Response.json({
				...mr,
				state: "merged",
				merge_commit_sha: "fixture-merged",
			});
		if (url.pathname.endsWith("/issues"))
			return Response.json([
				{
					iid: 8,
					title: "Fixture issue",
					web_url: "https://gitlab.com/team/sub/repo/-/issues/8",
					state: "opened",
				},
			]);
		if (url.pathname.endsWith("/merge_requests/7")) return Response.json(mr);
		if (url.pathname.endsWith("/notes")) return Response.json({ id: 9 });
		if (
			url.pathname.endsWith("/pipelines") ||
			url.pathname.endsWith("/statuses")
		)
			return Response.json([]);
		throw new Error(`Unexpected fixture request: ${url.pathname}`);
	}) as unknown as typeof fetch;
	const request = provider.getGitLabRequest(repo);
	if (!request) throw new Error("Missing fixture transport");
	const client = new GitLabProviderClient({
		host: repo.host,
		token: () => provider.getToken(repo.host),
		request,
	});
	expect((await client.fetchPullRequestContent(repo, 7)).body).toBe("MR body");
	expect(
		(await client.searchIssues(repo, { text: "fixture" })).issues[0]
			?.issueNumber,
	).toBe(8);
	await client.replyToReviewThread(
		"gitlab:gitlab.com:team/sub/repo:7:discussion",
		"Fixture reply",
	);
	expect(await client.mergePullRequest(repo, 7, "merge")).toMatchObject({
		merged: true,
		sha: "fixture-merged",
	});
	expect(
		requests
			.find(({ url }) => url.pathname.endsWith("/issues"))
			?.url.searchParams.get("search"),
	).toBe("fixture");
	expect(
		requests.find(({ url }) => url.pathname.endsWith("/notes"))?.init?.body,
	).toBe(JSON.stringify({ body: "Fixture reply" }));
	expect(
		requests.every(
			({ url, init }) =>
				url.origin === "https://gitlab.com" &&
				!new Headers(init?.headers).has("authorization") &&
				!new Headers(init?.headers).has("private-token"),
		),
	).toBe(true);
	expect(token).not.toHaveBeenCalled();
});
