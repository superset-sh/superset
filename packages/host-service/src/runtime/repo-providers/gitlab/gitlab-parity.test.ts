import { afterEach, expect, mock, test } from "bun:test";
import { GitLabProviderClient } from "./gitlab-provider-client";
import { fetchReviewThreadsGitLab } from "./gitlab-review";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
const deps = { host: "gl.example:8443", token: async () => "token" };
const repo = { owner: "acme/team", name: "widget" };
const head = { owner: repo.owner, repo: repo.name, branch: "feature" };
function mr(iid: number, source = 9) {
	return {
		iid,
		title: `MR${iid}`,
		web_url: `https://gl.example:8443/acme/team/widget/-/merge_requests/${iid}`,
		state: "opened",
		draft: false,
		sha: "abc",
		source_branch: "feature",
		target_branch: "main",
		source_project_id: source,
		target_project_id: 9,
		updated_at: "2026-01-01T00:00:00Z",
	};
}
function useFetch(
	fn: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
	globalThis.fetch = mock(
		async (input: string | URL | Request, init?: RequestInit) =>
			fn(new URL(String(input)), init),
	) as unknown as typeof fetch;
}
test("head lookup skips another fork with the same branch and follows every page", async () => {
	const pages: string[] = [];
	useFetch((url) => {
		pages.push(url.searchParams.get("page") ?? "");
		return Response.json(
			url.searchParams.get("page") === "2" ? [mr(2)] : [mr(1, 77)],
			{
				headers: {
					"x-next-page": url.searchParams.get("page") === "2" ? "" : "2",
				},
			},
		);
	});
	const result = await new GitLabProviderClient(deps).fetchPullRequestByHead(
		repo,
		head,
	);
	expect(result?.number).toBe(2);
	expect(pages).toEqual(["1", "2"]);
});
test("fork head lookup matches the complete source namespace", async () => {
	useFetch((url) =>
		url.pathname.endsWith("/projects/77")
			? Response.json({ path_with_namespace: "fork/sub/widget" })
			: Response.json([mr(1, 77)]),
	);
	const result = await new GitLabProviderClient(deps).fetchPullRequestByHead(
		repo,
		{ owner: "fork/sub", repo: "widget", branch: "feature" },
	);
	expect(result?.headRepositoryOwner?.login).toBe("fork/sub");
	const mismatch = await new GitLabProviderClient(deps).fetchPullRequestByHead(
		repo,
		{ owner: "other/sub", repo: "widget", branch: "feature" },
	);
	expect(mismatch).toBeNull();
});
test("checks include jobs after page100 and preserve optional job failures", async () => {
	useFetch((url) => {
		if (url.pathname.endsWith("/pipelines")) return Response.json([{ id: 1 }]);
		if (url.pathname.endsWith("/jobs")) {
			const page = url.searchParams.get("page");
			return Response.json(
				page === "2"
					? [{ id: 101, name: "late", status: "failed", allow_failure: true }]
					: Array.from({ length: 100 }, (_, i) => ({
							id: i,
							name: `job${i}`,
							status: "success",
						})),
				{ headers: { "x-next-page": page === "2" ? "" : "2" } },
			);
		}
		return Response.json([]);
	});
	const checks = await new GitLabProviderClient(deps).fetchChecks(repo, "abc");
	expect(checks).toHaveLength(101);
	expect(checks.at(-1)).toMatchObject({ name: "late", conclusion: "NEUTRAL" });
});
test("authentication, rate limits, and outages remain failures when fetching checks", async () => {
	for (const status of [401, 403, 429, 503]) {
		useFetch(() => new Response(null, { status }));
		await expect(
			new GitLabProviderClient(deps).fetchChecks(repo, "abc"),
		).rejects.toMatchObject({ status });
	}
});
test("review discussions include the second page", async () => {
	useFetch((url) => {
		if (!url.pathname.endsWith("/discussions"))
			return Response.json({
				web_url: "https://gl.example:8443/acme/team/widget/-/merge_requests/2",
			});
		const page = url.searchParams.get("page");
		return Response.json(
			page === "2"
				? [
						{
							id: "late",
							notes: [
								{
									id: 101,
									body: "later",
									system: false,
									position: null,
									author: { username: "reviewer", avatar_url: "" },
									created_at: "today",
								},
							],
						},
					]
				: Array.from({ length: 100 }, (_, i) => ({ id: String(i), notes: [] })),
			{ headers: { "x-next-page": page === "2" ? "" : "2" } },
		);
	});
	expect(
		(await fetchReviewThreadsGitLab(deps, repo, 2)).conversationComments,
	).toHaveLength(1);
});
