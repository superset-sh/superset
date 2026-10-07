import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	test,
} from "bun:test";
import type { RepoRef } from "../types";
import {
	fetchIssueContentGitLab,
	fetchPullRequestContentGitLab,
} from "./gitlab-content";

const REPO: RepoRef = { owner: "acme", name: "widget" };

const BASE_MR = {
	iid: 42,
	title: "Add new feature",
	web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/42",
	state: "opened" as const,
	draft: false,
	description: "A detailed description",
	source_branch: "feature/new-thing",
	target_branch: "main",
	sha: "abc123",
	source_project_id: 1,
	target_project_id: 1,
	author: { username: "alice" },
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-02T00:00:00Z",
};

const BASE_ISSUE = {
	iid: 7,
	title: "Something is broken",
	web_url: "https://gitlab.example.com/acme/widget/-/issues/7",
	state: "opened" as const,
	description: "It crashes on startup",
	author: { username: "bob" },
	created_at: "2024-02-01T00:00:00Z",
	updated_at: "2024-02-02T00:00:00Z",
};

function setupFetch(body: unknown, status = 200) {
	globalThis.fetch = mock(async (input: string) => ({
		ok: status >= 200 && status < 300,
		status,
		json: async () =>
			input.includes("/pipelines") || input.includes("/statuses") ? [] : body,
	})) as unknown as typeof fetch;
}

function makeDeps(token = "test-token") {
	return {
		host: "gitlab.example.com",
		token: async () => token,
	};
}

describe("fetchPullRequestContentGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function setupChecks(jobs: unknown[], statuses: unknown[]) {
		globalThis.fetch = mock(async (input: string | URL | Request) => {
			const path = new URL(String(input)).pathname;
			const body = path.endsWith("/pipelines")
				? jobs.length
					? [{ id: 2 }]
					: []
				: path.endsWith("/jobs")
					? jobs
					: path.endsWith("/statuses")
						? statuses
						: BASE_MR;
			return Response.json(body, { headers: { "x-next-page": "" } });
		}) as unknown as typeof fetch;
	}

	it.each([
		true,
		false,
	])("manual deployment with allow_failure=%s produces the native content rollup", async (allow_failure) => {
		setupChecks(
			[
				{ id: 10, name: "build", status: "success", allow_failure: false },
				{
					id: 20,
					name: "deploy",
					status: "manual",
					allow_failure,
					started_at: null,
					finished_at: null,
				},
			],
			[
				{
					id: 20,
					name: "deploy",
					status: "manual",
					allow_failure,
					finished_at: null,
				},
			],
		);
		const content = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(
			content.checks.find((check) => check.name === "deploy")?.status,
		).toBe(allow_failure ? "skipped" : "pending");
		expect(content.checksStatus).toBe(allow_failure ? "success" : "pending");
	});

	it.each([
		["skipped", "skipped", "success"],
		["canceled", "cancelled", "failure"],
	] as const)("terminal external %s status is reflected in content", async (status, checkStatus, checksStatus) => {
		setupChecks(
			[],
			[
				{
					id: 10,
					name: "external",
					status,
					allow_failure: false,
					created_at: "2026-10-04T09:00:00Z",
					finished_at: "2026-10-04T09:01:00Z",
				},
			],
		);
		const content = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(content.checks[0]?.status).toBe(checkStatus);
		expect(content.checksStatus).toBe(checksStatus);
	});

	it.each([
		"success",
		"failed",
	])("a newly queued pipeline stays pending and retains an external %s status", async (externalStatus) => {
		setupChecks(
			[
				{
					id: 20,
					name: "build",
					status: "pending",
					allow_failure: false,
					created_at: "2026-10-04T10:00:00Z",
					started_at: null,
					finished_at: null,
					pipeline: { id: 2 },
				},
			],
			[
				{
					id: 10,
					name: "build",
					status: "success",
					allow_failure: false,
					pipeline_id: 1,
					created_at: "2026-10-04T09:00:00Z",
					finished_at: "2026-10-04T09:01:00Z",
				},
				{
					id: 20,
					name: "build",
					status: "pending",
					allow_failure: false,
					pipeline_id: 2,
					created_at: "2026-10-04T10:00:00Z",
					finished_at: null,
				},
				{
					id: 25,
					name: "external",
					status: externalStatus,
					allow_failure: false,
					pipeline_id: 1,
					created_at: "2026-10-04T09:00:00Z",
					finished_at: "2026-10-04T09:01:00Z",
				},
			],
		);
		const content = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(content.checks.find((check) => check.name === "build")?.status).toBe(
			"pending",
		);
		expect(
			content.checks.find((check) => check.name === "external")?.status,
		).toBe(externalStatus === "success" ? "success" : "failure");
		expect(content.checks).toHaveLength(2);
		expect(content.checksStatus).toBe(
			externalStatus === "success" ? "pending" : "failure",
		);
	});

	it("content keeps a fresh same-name external failure when pipeline metadata is absent", async () => {
		setupChecks(
			[
				{
					id: 20,
					name: "build",
					status: "pending",
					pipeline: { id: 2 },
					allow_failure: false,
					created_at: "2026-10-04T10:00:00Z",
					started_at: null,
					finished_at: null,
				},
			],
			[
				{
					id: 30,
					name: "build",
					status: "failed",
					allow_failure: false,
					created_at: "2026-10-04T10:30:00Z",
					finished_at: "2026-10-04T10:31:00Z",
				},
			],
		);
		const content = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(content.checks[0]?.status).toBe("failure");
		expect(content.checksStatus).toBe("failure");
	});

	it.each<[number, number, number]>([
		[0, 1, 2],
		[0, 2, 1],
		[1, 0, 2],
		[1, 2, 0],
		[2, 0, 1],
		[2, 1, 0],
	])("content retains a fresh failure across mixed pipeline order %i/%i/%i", async (first, second, third) => {
		const order = [first, second, third];
		const statuses = [
			{
				id: 20,
				name: "build",
				pipeline_id: 2,
				status: "pending",
				allow_failure: false,
				target_url: null,
				description: null,
				created_at: "2026-10-04T10:00:00Z",
				finished_at: null,
			},
			{
				id: 25,
				name: "build",
				status: "failed",
				allow_failure: false,
				target_url: null,
				description: null,
				created_at: "2026-10-04T10:30:00Z",
				finished_at: "2026-10-04T10:31:00Z",
			},
			{
				id: 30,
				name: "build",
				pipeline_id: 1,
				status: "success",
				allow_failure: false,
				target_url: null,
				description: null,
				created_at: "2026-10-04T09:00:00Z",
				finished_at: "2026-10-04T11:00:00Z",
			},
		];
		setupChecks(
			[
				{
					id: 20,
					name: "build",
					status: "pending",
					allow_failure: false,
					stage: "test",
					web_url: "https://gitlab.example.com/acme/widget/-/jobs/20",
					created_at: "2026-10-04T10:00:00Z",
					started_at: null,
					finished_at: null,
				},
			],
			[
				...order.map((index) => statuses[index]),
				{
					id: 15,
					name: "external",
					pipeline_id: 1,
					status: "success",
					allow_failure: false,
					target_url: "https://ci.example.com/external",
					description: null,
					created_at: "2026-10-04T09:00:00Z",
					finished_at: "2026-10-04T09:01:00Z",
				},
			],
		);
		const content = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(content.checks).toEqual([
			{ name: "build", status: "failure", url: null },
			{
				name: "external",
				status: "success",
				url: "https://ci.example.com/external",
			},
		]);
		expect(content.checksStatus).toBe("failure");
	});

	it("content keeps a queued retry pending when its old run completes later", async () => {
		setupChecks(
			[
				{
					id: 22,
					name: "build",
					status: "pending",
					pipeline: { id: 2 },
					allow_failure: false,
					created_at: "2026-10-04T10:00:00Z",
					started_at: null,
					finished_at: null,
				},
			],
			[
				{
					id: 21,
					name: "build",
					status: "success",
					pipeline_id: 2,
					allow_failure: false,
					created_at: "2026-10-04T09:00:00Z",
					finished_at: "2026-10-04T11:00:00Z",
				},
			],
		);
		const content = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(content.checks[0]?.status).toBe("pending");
		expect(content.checksStatus).toBe("pending");
	});

	it("happy path: maps all fields correctly for same-project MR", async () => {
		setupFetch(BASE_MR);
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result).toEqual({
			number: 42,
			title: "Add new feature",
			body: "A detailed description",
			url: "https://gitlab.example.com/acme/widget/-/merge_requests/42",
			state: "open",
			branch: "feature/new-thing",
			baseBranch: "main",
			headRepositoryOwner: "acme",
			isCrossRepository: false,
			author: "alice",
			isDraft: false,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-02T00:00:00Z",

			checks: [],
			checksStatus: "none",
		});
	});

	it.each([
		"opened",
		"locked",
	])("normalizes %s merge requests to the neutral open state", async (state) => {
		setupFetch({ ...BASE_MR, state });
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.state).toBe("open");
	});

	it("state is passed through as-is (lowercase from GitLab)", async () => {
		setupFetch({ ...BASE_MR, state: "merged" });
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.state).toBe("merged");
	});

	it("body: null description → empty string", async () => {
		setupFetch({ ...BASE_MR, description: null });
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.body).toBe("");
	});

	it("body: undefined description → empty string", async () => {
		const { description: _d, ...noDesc } = BASE_MR;
		setupFetch(noDesc);
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.body).toBe("");
	});

	it("cross-repository: resolves the fork owner via GET /projects/:source_project_id", async () => {
		const bodies: unknown[] = [
			{ ...BASE_MR, source_project_id: 999, target_project_id: 1 },
			{ path_with_namespace: "contributor/widget" },
		];
		let i = 0;
		globalThis.fetch = mock(async (input: string) => ({
			ok: true,
			status: 200,
			json: async () =>
				input.includes("/pipelines") || input.includes("/statuses")
					? []
					: bodies[Math.min(i++, bodies.length - 1)],
		})) as unknown as typeof fetch;

		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.isCrossRepository).toBe(true);
		expect(result.headRepositoryOwner).toBe("contributor");
	});

	it("cross-repository: headRepositoryOwner=null when the fork lookup fails", async () => {
		setupFetch({ ...BASE_MR, source_project_id: 999, target_project_id: 1 });
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.headRepositoryOwner).toBeNull();
		expect(result.isCrossRepository).toBe(true);
	});

	it("same-project: headRepositoryOwner=repo.owner and isCrossRepository=false", async () => {
		setupFetch({ ...BASE_MR, source_project_id: 1, target_project_id: 1 });
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.headRepositoryOwner).toBe("acme");
		expect(result.isCrossRepository).toBe(false);
	});

	it("author: null/missing → null", async () => {
		setupFetch({ ...BASE_MR, author: null });
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.author).toBeNull();
	});

	it("isDraft: true is mapped", async () => {
		setupFetch({ ...BASE_MR, draft: true });
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result.isDraft).toBe(true);
	});

	it("calls the correct GitLab API endpoint", async () => {
		const urls: string[] = [];
		globalThis.fetch = mock(async (url: string) => {
			urls.push(url);
			return {
				ok: true,
				status: 200,
				json: async () =>
					url.includes("/pipelines") || url.includes("/statuses")
						? []
						: BASE_MR,
			} as Response;
		}) as unknown as typeof fetch;

		await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(
			urls.some((url) =>
				url.includes("/projects/acme%2Fwidget/merge_requests/42"),
			),
		).toBe(true);
	});

	it("rejects on 404", async () => {
		setupFetch({ message: "Not found" }, 404);
		await expect(
			fetchPullRequestContentGitLab(makeDeps(), REPO, 9999),
		).rejects.toThrow();
	});
});

describe("fetchIssueContentGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("happy path: maps all fields correctly", async () => {
		setupFetch(BASE_ISSUE);
		const result = await fetchIssueContentGitLab(makeDeps(), REPO, 7);
		expect(result).toEqual({
			number: 7,
			title: "Something is broken",
			body: "It crashes on startup",
			url: "https://gitlab.example.com/acme/widget/-/issues/7",
			state: "opened",
			author: "bob",
			createdAt: "2024-02-01T00:00:00Z",
			updatedAt: "2024-02-02T00:00:00Z",
		});
	});

	it("state is passed through as-is", async () => {
		setupFetch({ ...BASE_ISSUE, state: "closed" });
		const result = await fetchIssueContentGitLab(makeDeps(), REPO, 7);
		expect(result.state).toBe("closed");
	});

	it("body: null description → empty string", async () => {
		setupFetch({ ...BASE_ISSUE, description: null });
		const result = await fetchIssueContentGitLab(makeDeps(), REPO, 7);
		expect(result.body).toBe("");
	});

	it("body: missing description → empty string", async () => {
		const { description: _d, ...noDesc } = BASE_ISSUE;
		setupFetch(noDesc);
		const result = await fetchIssueContentGitLab(makeDeps(), REPO, 7);
		expect(result.body).toBe("");
	});

	it("author: null/missing → null", async () => {
		setupFetch({ ...BASE_ISSUE, author: null });
		const result = await fetchIssueContentGitLab(makeDeps(), REPO, 7);
		expect(result.author).toBeNull();
	});

	it("calls the correct GitLab API endpoint", async () => {
		let capturedUrl = "";
		globalThis.fetch = mock(async (url: string) => {
			capturedUrl = url;
			return {
				ok: true,
				status: 200,
				json: async () => BASE_ISSUE,
			} as Response;
		}) as unknown as typeof fetch;

		await fetchIssueContentGitLab(makeDeps(), REPO, 7);
		expect(capturedUrl).toContain("/projects/acme%2Fwidget/issues/7");
	});

	it("rejects on 404", async () => {
		setupFetch({ message: "Not found" }, 404);
		await expect(
			fetchIssueContentGitLab(makeDeps(), REPO, 9999),
		).rejects.toThrow();
	});
});

test("fork checks use source project and carry selected MR proof", async () => {
	const original = globalThis.fetch;
	const paths: string[] = [];
	try {
		globalThis.fetch = mock(async (url, init) => {
			const path = new URL(String(url)).pathname;
			paths.push(path);
			if (path.endsWith("/merge_requests/7"))
				return Response.json({
					iid: 7,
					title: "Fork",
					web_url: "https://gitlab.example.com/target/repo/-/merge_requests/7",
					state: "opened",
					source_project_id: 42,
					target_project_id: 1,
					sha: "abcdef",
					source_branch: "feature",
					target_branch: "main",
				});
			expect(
				new Headers(init?.headers).get("x-superset-gitlab-merge-request"),
			).toBe("7");
			if (path.endsWith("/projects/42"))
				return Response.json({ path_with_namespace: "fork/sub/repo" });
			if (path.endsWith("/pipelines")) return Response.json([{ id: 9 }]);
			if (path.endsWith("/jobs"))
				return Response.json([
					{
						id: 8,
						name: "fork CI",
						status: "success",
						web_url: "https://gitlab.example.com/fork/sub/repo/-/jobs/8",
					},
				]);
			return Response.json([]);
		}) as unknown as typeof fetch;
		const content = await fetchPullRequestContentGitLab(
			{ host: "gitlab.example.com", token: async () => "fixture" },
			{ owner: "target", name: "repo" },
			7,
		);
		expect(content.checks.map((check) => check.name)).toEqual(["fork CI"]);
		expect(
			paths.slice(2).every((path) => path.startsWith("/api/v4/projects/42/")),
		).toBe(true);
	} finally {
		globalThis.fetch = original;
	}
});
