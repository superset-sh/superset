import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { CheckContextNode } from "../types";
import { GitLabProviderClient } from "./gitlab-provider-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO = { owner: "acme", name: "widget" };
const HEAD = { owner: "acme", repo: "widget", branch: "feature/foo" };
const HEAD_SHA = "abc123def456";

function makeClient(token: string | null = "tok-abc") {
	return new GitLabProviderClient({
		host: "gitlab.example.com",
		token: async () => token,
	});
}

// ---------------------------------------------------------------------------
// fetchPullRequestByHead
// ---------------------------------------------------------------------------

describe("GitLabProviderClient.fetchPullRequestByHead", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetch(responses: Array<{ status: number; body: unknown }>) {
		let callIndex = 0;
		globalThis.fetch = mock(async () => {
			const response = responses[callIndex] ?? {
				status: 200,
				body: [],
			};
			callIndex++;
			return {
				ok: response.status >= 200 && response.status < 300,
				status: response.status,
				json: async () => response.body,
			} as Response;
		}) as unknown as typeof fetch;
	}

	it("exposes provider = 'gitlab' and host", () => {
		const client = makeClient();
		expect(client.provider).toBe("gitlab");
		expect(client.host).toBe("gitlab.example.com");
	});

	it("returns null when no MRs match the branch", async () => {
		mockFetch([{ status: 200, body: [] }]);
		const result = await makeClient().fetchPullRequestByHead(REPO, HEAD);
		expect(result).toBeNull();
	});

	it("returns mapped PullRequestNode for the first (newest) MR", async () => {
		const mr = {
			iid: 5,
			title: "My feature",
			web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/5",
			state: "opened",
			draft: false,
			sha: HEAD_SHA,
			source_branch: HEAD.branch,
			target_branch: "main",
			source_project_id: 1,
			target_project_id: 1,
			detailed_merge_status: "mergeable",
			blocking_discussions_resolved: true,
			has_conflicts: false,
			author: { username: "alice" },
			created_at: "2024-01-01T00:00:00Z",
			updated_at: "2024-01-02T00:00:00Z",
			merged_at: null,
		};
		mockFetch([{ status: 200, body: [mr] }]);

		const result = await makeClient().fetchPullRequestByHead(REPO, HEAD);
		expect(result).not.toBeNull();
		expect(result?.number).toBe(5);
		expect(result?.state).toBe("OPEN");
		expect(result?.headRefName).toBe(HEAD.branch);
	});

	it("picks the first (most recently updated) MR when multiple match", async () => {
		const older = {
			iid: 3,
			title: "Old MR",
			web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/3",
			state: "opened",
			draft: false,
			sha: "aaa",
			source_branch: HEAD.branch,
			target_branch: "main",
			source_project_id: 1,
			target_project_id: 1,
			detailed_merge_status: "mergeable",
			blocking_discussions_resolved: true,
			has_conflicts: false,
			author: { username: "bob" },
			created_at: "2023-12-01T00:00:00Z",
			updated_at: "2023-12-01T00:00:00Z",
			merged_at: null,
		};
		const newer = {
			...older,
			iid: 7,
			title: "New MR",
			updated_at: "2024-01-10T00:00:00Z",
		};

		// GitLab returns ordered_by updated_at; the API returns newest first
		mockFetch([{ status: 200, body: [newer, older] }]);

		const result = await makeClient().fetchPullRequestByHead(REPO, HEAD);
		expect(result?.number).toBe(7);
	});

	it("calls the correct GitLab API endpoint with right params", async () => {
		let capturedUrl = "";
		globalThis.fetch = mock(async (url: string) => {
			capturedUrl = url;
			return {
				ok: true,
				status: 200,
				json: async () => [],
			} as Response;
		}) as unknown as typeof fetch;

		await makeClient().fetchPullRequestByHead(REPO, HEAD);

		expect(capturedUrl).toContain(
			"/api/v4/projects/acme%2Fwidget/merge_requests",
		);
		expect(capturedUrl).toContain("source_branch=feature%2Ffoo");
		expect(capturedUrl).toContain("state=all");
		expect(capturedUrl).toContain("order_by=updated_at");
		expect(capturedUrl).toContain("per_page=10");
	});
});

// ---------------------------------------------------------------------------
// fetchChecks
// ---------------------------------------------------------------------------

describe("GitLabProviderClient.fetchChecks", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	// Helper to set up fetch with multiple sequential responses
	function setupFetch(
		handler: (url: string) => { status: number; body: unknown },
	) {
		globalThis.fetch = mock(async (url: string) => {
			const { status, body } = handler(url);
			return {
				ok: status >= 200 && status < 300,
				status,
				json: async () => body,
			} as Response;
		}) as unknown as typeof fetch;
	}

	it("returns empty array when no pipelines exist and statuses are empty", async () => {
		setupFetch((url) => {
			if (url.includes("/pipelines")) return { status: 200, body: [] };
			if (url.includes("/statuses")) return { status: 200, body: [] };
			return { status: 200, body: [] };
		});

		const result = await makeClient().fetchChecks(REPO, HEAD_SHA);
		expect(result).toEqual([]);
	});

	it("returns combined pipeline jobs + commit statuses as CheckContextNodes", async () => {
		const pipeline = {
			id: 100,
			status: "success",
			ref: "feature/foo",
			sha: HEAD_SHA,
		};
		const job = {
			id: 1,
			name: "build",
			status: "success",
			stage: "build",
			web_url: "https://gitlab.example.com/-/jobs/1",
			started_at: "2024-01-02T00:00:00Z",
			finished_at: "2024-01-02T00:01:00Z",
			allow_failure: false,
		};
		const status = {
			id: 2,
			name: "coverage/codecov",
			status: "success",
			target_url: "https://codecov.io/build/2",
			description: "Coverage 95%",
			finished_at: "2024-01-02T00:01:00Z",
			allow_failure: false,
		};

		setupFetch((url) => {
			if (
				url.includes(`/pipelines?`) ||
				url.includes("&sha=") ||
				url.includes("sha=")
			) {
				if (!url.includes("/jobs")) return { status: 200, body: [pipeline] };
			}
			if (url.includes(`/pipelines/${pipeline.id}/jobs`)) {
				return { status: 200, body: [job] };
			}
			if (url.includes("/statuses")) return { status: 200, body: [status] };
			return { status: 200, body: [] };
		});

		const result = await makeClient().fetchChecks(REPO, HEAD_SHA);
		expect(result.length).toBeGreaterThan(0);
		const typenames = result
			.filter((n): n is NonNullable<CheckContextNode> => n !== null)
			.map((n) => n.__typename);
		expect(typenames).toContain("CheckRun");
		expect(typenames).toContain("StatusContext");
	});

	it("tolerates a 404 from the pipelines endpoint (returns statuses only)", async () => {
		setupFetch((url) => {
			if (url.includes("/pipelines"))
				return { status: 404, body: { message: "Not found" } };
			if (url.includes("/statuses")) return { status: 200, body: [] };
			return { status: 200, body: [] };
		});

		const result = await makeClient().fetchChecks(REPO, HEAD_SHA);
		expect(result).toEqual([]);
	});

	it("tolerates a 404 from the statuses endpoint", async () => {
		setupFetch((url) => {
			if (url.includes("/pipelines")) return { status: 200, body: [] };
			if (url.includes("/statuses"))
				return { status: 404, body: { message: "Not found" } };
			return { status: 200, body: [] };
		});

		const result = await makeClient().fetchChecks(REPO, HEAD_SHA);
		expect(result).toEqual([]);
	});

	it("uses per_page=1 for the pipeline list and per_page=100 for jobs/statuses", async () => {
		const capturedUrls: string[] = [];
		const pipeline = { id: 55, status: "running", ref: "main", sha: HEAD_SHA };

		globalThis.fetch = mock(async (url: string) => {
			capturedUrls.push(url);
			let body: unknown = [];
			if (
				url.includes(`/pipelines?`) ||
				(url.includes("/pipelines") && !url.includes("/jobs"))
			) {
				body = [pipeline];
			}
			return {
				ok: true,
				status: 200,
				json: async () => body,
			} as Response;
		}) as unknown as typeof fetch;

		await makeClient().fetchChecks(REPO, HEAD_SHA);

		const pipelineListUrl = capturedUrls.find(
			(u) => u.includes("/pipelines") && !u.includes("/jobs"),
		);
		const jobsUrl = capturedUrls.find((u) => u.includes("/jobs"));
		const statusesUrl = capturedUrls.find((u) => u.includes("/statuses"));

		expect(pipelineListUrl).toContain("per_page=1");
		if (jobsUrl) expect(jobsUrl).toContain("per_page=100");
		if (statusesUrl) expect(statusesUrl).toContain("per_page=100");
	});
});

// ---------------------------------------------------------------------------
// fetchReviewState (§6 no-reduction model)
// ---------------------------------------------------------------------------

describe("GitLabProviderClient.fetchReviewState", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	/** Build a synthetic MR response object with the relevant fields. */
	function mrFixture(overrides?: {
		detailed_merge_status?: string;
		blocking_discussions_resolved?: boolean;
		has_conflicts?: boolean;
	}) {
		return {
			detailed_merge_status: "mergeable",
			blocking_discussions_resolved: true,
			has_conflicts: false,
			...overrides,
		};
	}

	/** Build a synthetic approvals response. */
	function approvalsFixture(overrides?: {
		approvals_required?: number;
		approvals_left?: number;
		approved_by?: { user: { username: string } }[];
	}) {
		return {
			approvals_required: 1,
			approvals_left: 0,
			approved_by: [{ user: { username: "alice" } }],
			...overrides,
		};
	}

	function mockFetchWithRoutes(
		handler: (url: string) => { status: number; body: unknown },
	) {
		globalThis.fetch = mock(async (url: string) => {
			const { status, body } = handler(url);
			return {
				ok: status >= 200 && status < 300,
				status,
				json: async () => body,
			} as Response;
		}) as unknown as typeof fetch;
	}

	it("returns the gitlab variant with all facts verbatim", async () => {
		mockFetchWithRoutes((url) => {
			if (url.includes("/approvals"))
				return { status: 200, body: approvalsFixture() };
			// MR endpoint (no /approvals suffix)
			return { status: 200, body: mrFixture() };
		});

		const result = await makeClient().fetchReviewState(REPO, 5, "open");

		expect(result.provider).toBe("gitlab");
		if (result.provider !== "gitlab") throw new Error("wrong provider");
		expect(result.detailedMergeStatus).toBe("mergeable");
		expect(result.blockingDiscussionsResolved).toBe(true);
		expect(result.hasConflicts).toBe(false);
		expect(result.approvalsRequired).toBe(1);
		expect(result.approvalsLeft).toBe(0);
		expect(result.approvedBy).toEqual(["alice"]);
	});

	it("maps approved_by to usernames only — no raw user objects stored", async () => {
		mockFetchWithRoutes((url) => {
			if (url.includes("/approvals"))
				return {
					status: 200,
					body: approvalsFixture({
						approved_by: [
							{ user: { username: "alice" } },
							{ user: { username: "bob" } },
						],
					}),
				};
			return { status: 200, body: mrFixture() };
		});

		const result = await makeClient().fetchReviewState(REPO, 5, "open");
		if (result.provider !== "gitlab") throw new Error("wrong provider");
		expect(result.approvedBy).toEqual(["alice", "bob"]);
	});

	it("stores missing approval fields as null — NOT inferred as satisfied", async () => {
		mockFetchWithRoutes((url) => {
			if (url.includes("/approvals"))
				return {
					status: 200,
					// No approvals_required / approvals_left fields
					body: { approved_by: [] },
				};
			return { status: 200, body: mrFixture() };
		});

		const result = await makeClient().fetchReviewState(REPO, 5, "open");
		if (result.provider !== "gitlab") throw new Error("wrong provider");
		// Must be null, not 0 or false (do not infer "satisfied")
		expect(result.approvalsRequired).toBeNull();
		expect(result.approvalsLeft).toBeNull();
		expect(result.approvedBy).toEqual([]);
	});

	it("carries non-mergeable detailed_merge_status verbatim without coercion", async () => {
		mockFetchWithRoutes((url) => {
			if (url.includes("/approvals"))
				return { status: 200, body: approvalsFixture({ approvals_left: 2 }) };
			return {
				status: 200,
				body: mrFixture({
					detailed_merge_status: "approvals_syncing",
					blocking_discussions_resolved: false,
					has_conflicts: true,
				}),
			};
		});

		const result = await makeClient().fetchReviewState(REPO, 10, "open");
		if (result.provider !== "gitlab") throw new Error("wrong provider");
		expect(result.detailedMergeStatus).toBe("approvals_syncing");
		expect(result.blockingDiscussionsResolved).toBe(false);
		expect(result.hasConflicts).toBe(true);
		expect(result.approvalsLeft).toBe(2);
	});

	it("does not add any synthesized cross-provider verdict field", async () => {
		mockFetchWithRoutes((url) => {
			if (url.includes("/approvals"))
				return { status: 200, body: approvalsFixture() };
			return { status: 200, body: mrFixture() };
		});

		const result = await makeClient().fetchReviewState(REPO, 5, "open");
		expect("verdict" in result).toBe(false);
		expect("approved" in result).toBe(false);
		expect("reviewDecision" in result).toBe(false);
	});

	it("hits the MR endpoint and approvals endpoint with the correct paths", async () => {
		const capturedUrls: string[] = [];
		globalThis.fetch = mock(async (url: string) => {
			capturedUrls.push(url);
			const body = url.includes("/approvals")
				? approvalsFixture()
				: mrFixture();
			return { ok: true, status: 200, json: async () => body } as Response;
		}) as unknown as typeof fetch;

		await makeClient().fetchReviewState(REPO, 42, "open");

		const mrUrl = capturedUrls.find(
			(u) => u.includes("/merge_requests/42") && !u.includes("/approvals"),
		);
		const approvalsUrl = capturedUrls.find((u) =>
			u.includes("/merge_requests/42/approvals"),
		);

		expect(mrUrl).toContain("/api/v4/projects/acme%2Fwidget/merge_requests/42");
		expect(approvalsUrl).toContain(
			"/api/v4/projects/acme%2Fwidget/merge_requests/42/approvals",
		);
	});
});

// ---------------------------------------------------------------------------
// fetchPullRequestMetadata — fork (cross-repo) MR owner/name resolution
// ---------------------------------------------------------------------------

describe("GitLabProviderClient.fetchPullRequestMetadata (fork MR resolution)", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	/** Synthetic same-project MR. */
	const SAME_MR = {
		iid: 10,
		title: "Same-project MR",
		web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/10",
		state: "opened",
		source_branch: "feature/x",
		target_branch: "main",
		sha: "sha-same",
		source_project_id: 42,
		target_project_id: 42,
	};

	/** Synthetic cross-project (fork) MR. */
	const FORK_MR = {
		iid: 20,
		title: "Fork MR",
		web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/20",
		state: "opened",
		source_branch: "feature/y",
		target_branch: "main",
		sha: "sha-fork",
		source_project_id: 99,
		target_project_id: 42,
	};

	function setupFetchHandler(
		handler: (url: string) => { status: number; body: unknown },
	) {
		globalThis.fetch = mock(async (url: string) => {
			const { status, body } = handler(url);
			return {
				ok: status >= 200 && status < 300,
				status,
				headers: { get: () => null },
				json: async () => body,
			} as unknown as Response;
		}) as unknown as typeof fetch;
	}

	it("same-project MR: headRepositoryOwner/Name equals the target repo", async () => {
		setupFetchHandler(() => ({ status: 200, body: SAME_MR }));

		const result = await makeClient().fetchPullRequestMetadata(REPO, 10);

		expect(result.isCrossRepository).toBe(false);
		expect(result.headRepositoryOwner).toBe("acme");
		expect(result.headRepositoryName).toBe("widget");
	});

	it("fork MR: resolves headRepositoryOwner/Name from /projects/:id", async () => {
		const capturedUrls: string[] = [];
		setupFetchHandler((url) => {
			capturedUrls.push(url);
			if (url.includes("/projects/99")) {
				return {
					status: 200,
					body: { path_with_namespace: "bob-fork/widget" },
				};
			}
			return { status: 200, body: FORK_MR };
		});

		const result = await makeClient().fetchPullRequestMetadata(REPO, 20);

		expect(result.isCrossRepository).toBe(true);
		expect(result.headRepositoryOwner).toBe("bob-fork");
		expect(result.headRepositoryName).toBe("widget");
		// Should have called the projects/:id endpoint for the fork
		expect(capturedUrls.some((u) => u.includes("/projects/99"))).toBe(true);
	});

	it("fork MR: falls back to empty strings when /projects/:id returns 404", async () => {
		setupFetchHandler((url) => {
			if (url.includes("/projects/99"))
				return { status: 404, body: { message: "Not found" } };
			return { status: 200, body: FORK_MR };
		});

		const result = await makeClient().fetchPullRequestMetadata(REPO, 20);

		expect(result.isCrossRepository).toBe(true);
		expect(result.headRepositoryOwner).toBe("");
		expect(result.headRepositoryName).toBe("");
	});

	it("fork MR with nested subgroup namespace resolves correctly", async () => {
		setupFetchHandler((url) => {
			if (url.includes("/projects/99"))
				return {
					status: 200,
					body: { path_with_namespace: "org/subgroup/widget-fork" },
				};
			return { status: 200, body: FORK_MR };
		});

		const result = await makeClient().fetchPullRequestMetadata(REPO, 20);

		expect(result.headRepositoryOwner).toBe("org/subgroup");
		expect(result.headRepositoryName).toBe("widget-fork");
	});
});
