import { afterEach, beforeEach, expect, test } from "bun:test";
import { GitLabProviderClient } from "../../../runtime/repo-providers/gitlab/gitlab-provider-client";
import type { HostServiceContext } from "../../../types";
import { gitLabPullRequestDetail } from "./gitlab-detail";

const HOST = "git.example.invalid:8443",
	path = "Group/Sub/Widget";
const originalFetch = globalThis.fetch;
let jobs: unknown[], requests: string[];
const job = (extra: Record<string, unknown> = {}) => ({
	id: 10,
	name: "build",
	status: "success",
	stage: "test",
	web_url: `https://${HOST}/${path}/-/jobs/10`,
	started_at: "2026-10-04T12:00:00.123+02:00",
	finished_at: "2026-10-04T12:01:00.456+02:00",
	allow_failure: false,
	...extra,
});
const mr = {
	id: 100,
	iid: 7,
	title: "Native",
	description: "body",
	web_url: `https://${HOST}/${path}/-/merge_requests/7`,
	state: "opened",
	draft: false,
	source_branch: "feature",
	target_branch: "main",
	source_project_id: 1,
	target_project_id: 1,
	sha: "abc123",
	author: { id: 7, username: "author" },
	created_at: "2026-10-01T00:00:00Z",
	updated_at: "2026-10-04T00:00:00Z",
	merged_at: null,
	reviewers: [],
	changes_count: "1",
	detailed_merge_status: "mergeable",
	blocking_discussions_resolved: true,
	has_conflicts: false,
	user: { can_merge: true },
	rebase_in_progress: false,
};
beforeEach(() => {
	jobs = [job()];
	requests = [];
	globalThis.fetch = Object.assign(
		async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url,
			);
			expect(url.origin).toBe(`https://${HOST}`);
			expect(init?.method ?? "GET").toBe("GET");
			requests.push(url.pathname);
			if (url.pathname.endsWith("/diffs"))
				return Response.json([
					{ old_path: "a", new_path: "a", diff: "@@ -1 +1 @@\n-old\n+new\n" },
				]);
			if (url.pathname.endsWith("/approvals"))
				return Response.json({
					approvals_required: 0,
					approvals_left: 0,
					approved_by: [],
				});
			if (
				url.pathname.endsWith("/discussions") ||
				url.pathname.endsWith("/statuses")
			)
				return Response.json([]);
			if (url.pathname.endsWith("/pipelines"))
				return Response.json([{ id: 9 }]);
			if (url.pathname.endsWith("/jobs")) return Response.json(jobs);
			if (url.pathname.endsWith("/user"))
				return Response.json({ id: 7, username: "author" });
			if (url.pathname.endsWith("/projects/Group%2FSub%2FWidget"))
				return Response.json({
					id: 1,
					merge_method: "merge",
					squash_option: "default_off",
					permissions: { project_access: { access_level: 40 } },
				});
			if (url.pathname.endsWith("/merge_requests/7")) return Response.json(mr);
			throw Error("Unexpected fixture endpoint");
		},
		{ preconnect: originalFetch.preconnect },
	);
});
afterEach(() => {
	globalThis.fetch = originalFetch;
});
async function detail() {
	const ctx = {
		credentials: { getToken: async () => "fixture-token" },
	} as unknown as HostServiceContext;
	const client = new GitLabProviderClient({
		host: HOST,
		token: async () => "fixture-token",
	});
	return gitLabPullRequestDetail(
		ctx,
		{
			client,
			repo: {
				provider: "gitlab",
				host: HOST,
				owner: "Group/Sub",
				name: "Widget",
				repoPath: "/fixture",
				remoteName: "origin",
				url: `https://${HOST}/Group/Sub/Widget`,
			},
		},
		7,
	);
}
test("real native detail preserves selected job times without duplicate jobs or pipeline calls", async () => {
	const value = await detail();
	expect(value.checks).toMatchObject([
		{
			name: "build",
			startedAt: job().started_at,
			completedAt: job().finished_at,
		},
	]);
	expect(requests.filter((p) => p.endsWith("/pipelines"))).toHaveLength(1);
	expect(requests.filter((p) => p.endsWith("/jobs"))).toHaveLength(1);
	expect(requests.filter((p) => p.endsWith("/statuses"))).toHaveLength(1);
});
test("rich native detail renders queued newest retry without old timing", async () => {
	jobs = [
		job(),
		job({ id: 11, status: "pending", started_at: null, finished_at: null }),
	];
	expect((await detail()).checks).toMatchObject([
		{ status: "IN_PROGRESS", startedAt: null, completedAt: null },
	]);
});
test("malformed raw native job stamps remain null in rich wire output", async () => {
	jobs = [job({ started_at: "broken", finished_at: "2026-02-30T10:00:00Z" })];
	expect((await detail()).checks).toMatchObject([
		{ startedAt: null, completedAt: null },
	]);
});
