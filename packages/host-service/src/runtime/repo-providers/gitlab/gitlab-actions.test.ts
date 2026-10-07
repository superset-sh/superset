import { afterEach, expect, mock, test } from "bun:test";
import { GitLabProviderClient } from "./gitlab-provider-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
const repo = { owner: "acme/team", name: "widget" };
const client = new GitLabProviderClient({
	host: "gl.example:8443",
	token: async () => "token",
	rebasePollIntervalMs: 0,
});
const writes: Array<{
	url: URL;
	body: Record<string, unknown>;
	method: string;
}> = [];
function setup(preference?: { option: string; squash: boolean }) {
	writes.length = 0;
	globalThis.fetch = mock(
		async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(String(input));
			if (init?.method) {
				const body = JSON.parse(String(init.body));
				writes.push({ url, body, method: init.method });
				return Response.json({
					iid: 3,
					web_url:
						"https://gl.example:8443/acme/team/widget/-/merge_requests/3",
					state: "merged",
					sha: "source",
					merge_commit_sha: "integrated",
					title: "feature",
				});
			}
			if (url.pathname.endsWith("/diffs")) {
				const page = url.searchParams.get("page");
				return Response.json(
					[
						{
							old_path: `file${page}.ts`,
							new_path: `file${page}.ts`,
							diff: "@@ -1 +1 @@\n-old\n+new\n",
						},
					],
					{ headers: { "x-next-page": page === "1" ? "2" : "" } },
				);
			}
			if (url.pathname.endsWith("/user")) return Response.json({ id: 1 });
			if (url.pathname.endsWith("/merge_requests/3"))
				return Response.json({
					iid: 3,
					title: "Draft: feature",
					draft: true,
					state: "opened",
					source_project_id: 9,
					target_project_id: 9,
					source_branch: "feature",
					author: { id: 1 },
					user: { can_merge: false },
					detailed_merge_status: "mergeable",
					...(preference
						? { squash: preference.squash, squash_on_merge: preference.squash }
						: {}),
				});
			return Response.json({
				id: 9,
				merge_method: "ff",
				squash_option: preference?.option ?? "always",
				permissions: { project_access: { access_level: 40 } },
			});
		},
	) as unknown as typeof fetch;
}
test.each([
	{ option: "default_off", squash: true, enabled: true },
	{ option: "default_on", squash: false, enabled: false },
	{ option: "always", squash: false, enabled: true },
	{ option: "never", squash: true, enabled: false },
])("capabilities carry effective MR squash preference under $option", async (preference) => {
	setup(preference);
	const capabilities = await client.pullRequestCapabilities(repo, 3);
	expect(capabilities.mergePolicy).toMatchObject({
		squashEnabled: preference.enabled,
	});
});
test("an explicitly confirmed plain merge disables MR squashing", async () => {
	setup({ option: "default_on", squash: true });
	await client.mergePullRequest(repo, 3, "merge", { squash: false });
	expect(writes[0]?.body).toEqual({ squash: false });
});
test("GitLab diff includes native patch headers and every page", async () => {
	setup();
	const patch = await client.fetchPullRequestDiff(repo, 3);
	expect(patch).toContain("diff --git a/file1.ts b/file1.ts");
	expect(patch).toContain("--- a/file2.ts\n+++ b/file2.ts");
});
test("ready, close and reopen use GitLab state transitions", async () => {
	setup();
	await client.markPullRequestReady(repo, 3);
	await client.setPullRequestState(repo, 3, "closed");
	await client.reopenPullRequest(repo, 3);
	expect(writes.map((item) => item.body)).toEqual([
		{ title: "feature" },
		{ state_event: "close" },
		{ state_event: "reopen" },
	]);
});
test("creation uses the project and preserves draft and description", async () => {
	setup();
	const created = await client.createPullRequest(repo, {
		title: "feature",
		body: "description",
		draft: true,
		head: { owner: repo.owner, repo: repo.name, branch: "feature" },
		base: "main",
	});
	expect(created).toEqual({
		number: 3,
		url: "https://gl.example:8443/acme/team/widget/-/merge_requests/3",
	});
	expect(writes[0]?.method).toBe("POST");
	expect(writes[0]?.body).toMatchObject({
		source_branch: "feature",
		target_branch: "main",
		title: "Draft: feature",
		description: "description",
	});
});
test("capabilities preserve GitLab permission and project merge policy", async () => {
	setup();
	const capabilities = await client.pullRequestCapabilities(repo, 3);
	expect(capabilities).toMatchObject({
		merge: false,
		markReady: true,
		dequeue: false,
		mergePolicy: { provider: "gitlab", method: "ff", squash: "always" },
	});
});
test("merge carries the message and returns the integration commit", async () => {
	setup();
	expect(
		await client.mergePullRequest(repo, 3, "merge", {
			commitMessage: "message",
		}),
	).toMatchObject({ sha: "integrated", merged: true });
	expect(writes[0]?.body.merge_commit_message).toBe("message");
});
test("fork metadata uses the actual clone URL and does not hide access failures", async () => {
	for (const status of [200, 403, 503, 404]) {
		globalThis.fetch = mock(async (input: string | URL | Request) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/merge_requests/3"))
				return Response.json({
					iid: 3,
					web_url: "url",
					title: "feature",
					source_project_id: 77,
					target_project_id: 9,
					source_branch: "feature",
					target_branch: "main",
					sha: "source",
					state: "opened",
				});
			return Response.json(
				{
					path_with_namespace: "people/sub/fork",
					http_url_to_repo: "https://gl.example:8443/people/sub/fork.git",
				},
				{ status },
			);
		}) as unknown as typeof fetch;
		if (status === 403 || status === 503)
			await expect(
				client.fetchPullRequestMetadata(repo, 3),
			).rejects.toMatchObject({ status });
		else
			expect(await client.fetchPullRequestMetadata(repo, 3)).toMatchObject({
				provider: "gitlab",
				host: "gl.example:8443",
				headRepositoryUrl:
					status === 200 ? "https://gl.example:8443/people/sub/fork.git" : null,
			});
	}
});
test("content CI failure remains visible instead of an empty successful rollup", async () => {
	setup();
	const base = globalThis.fetch;
	globalThis.fetch = mock(
		async (input: string | URL | Request, init?: RequestInit) =>
			String(input).includes("/pipelines")
				? Response.json({ message: "unavailable" }, { status: 503 })
				: base(input, init),
	) as unknown as typeof fetch;
	await expect(client.fetchPullRequestContent(repo, 3)).rejects.toMatchObject({
		status: 503,
	});
});
test("Free GitLab keeps native review state when premium approval counts are unavailable", async () => {
	setup();
	const base = globalThis.fetch;
	globalThis.fetch = mock(
		async (input: string | URL | Request, init?: RequestInit) =>
			String(input).endsWith("/approvals")
				? Response.json({ message: "not found" }, { status: 404 })
				: base(input, init),
	) as unknown as typeof fetch;
	expect(await client.fetchReviewState(repo, 3, "open")).toMatchObject({
		provider: "gitlab",
		detailedMergeStatus: "mergeable",
		approvalsRequired: null,
		approvalsLeft: null,
	});
});
test("discussion resolution preserves authentication errors and encodes discussion IDs", async () => {
	globalThis.fetch = mock(async (input: string | URL | Request) => {
		expect(String(input)).toContain("/discussions/discussion%2Fid");
		return Response.json({ message: "forbidden" }, { status: 403 });
	}) as unknown as typeof fetch;
	await expect(
		client.setReviewThreadResolution(
			"gitlab:gl.example%3A8443:acme/team/widget:3:discussion/id",
			true,
		),
	).rejects.toMatchObject({ status: 403 });
});
