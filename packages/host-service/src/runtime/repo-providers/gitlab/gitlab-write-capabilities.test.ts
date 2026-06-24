/**
 * Unit tests for the three new GitLab write/checkout capabilities:
 *   - GitLabProviderClient.mergePullRequest
 *   - GitLabProviderClient.fetchPullRequestMetadata
 *   - GitLabProviderClient.getAuthenticatedUser
 *
 * All network calls are intercepted via globalThis.fetch mocks — no live
 * GitLab instance is required.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { GitLabProviderClient } from "./gitlab-provider-client";

const REPO = { owner: "acme", name: "widget" };
const PR_NUMBER = 7;

function makeClient(token: string | null = "tok-abc") {
	return new GitLabProviderClient({
		host: "gitlab.example.com",
		token: async () => token,
	});
}

// ---------------------------------------------------------------------------
// mergePullRequest
// ---------------------------------------------------------------------------

describe("GitLabProviderClient.mergePullRequest", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetch(status: number, body: unknown) {
		let capturedUrl = "";
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
			capturedUrl = url;
			capturedInit = init;
			return {
				ok: status >= 200 && status < 300,
				status,
				json: async () => body,
			} as Response;
		}) as unknown as typeof fetch;
		return {
			getCapturedUrl: () => capturedUrl,
			getCapturedInit: () => capturedInit,
		};
	}

	const mergedMrFixture = {
		iid: PR_NUMBER,
		title: "feat: add widget",
		web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/7",
		state: "merged" as const,
		draft: false,
		sha: "abc123def456789012345678901234567890abcd",
		source_branch: "feature/widget",
		target_branch: "main",
		source_project_id: 1,
		target_project_id: 1,
		detailed_merge_status: "mergeable",
		blocking_discussions_resolved: true,
		has_conflicts: false,
		author: { username: "alice" },
		created_at: "2024-01-01T00:00:00Z",
		updated_at: "2024-01-02T00:00:00Z",
		merged_at: "2024-01-03T00:00:00Z",
	};

	it("returns MergeResult with sha, merged=true, message for a successful plain merge", async () => {
		mockFetch(200, mergedMrFixture);

		const result = await makeClient().mergePullRequest(
			REPO,
			PR_NUMBER,
			"merge",
		);

		expect(result.sha).toBe(mergedMrFixture.sha);
		expect(result.merged).toBe(true);
		expect(result.message).toBe(mergedMrFixture.title);
	});

	it("sends squash=true when method='squash'", async () => {
		const { getCapturedInit } = mockFetch(200, mergedMrFixture);

		await makeClient().mergePullRequest(REPO, PR_NUMBER, "squash");

		const body = JSON.parse(getCapturedInit()?.body as string);
		expect(body.squash).toBe(true);
	});

	it("sends squash=false when method='merge'", async () => {
		const { getCapturedInit } = mockFetch(200, mergedMrFixture);

		await makeClient().mergePullRequest(REPO, PR_NUMBER, "merge");

		const body = JSON.parse(getCapturedInit()?.body as string);
		expect(body.squash).toBe(false);
	});

	it("maps rebase to squash=false (plain merge — GitLab rebase is async)", async () => {
		const { getCapturedInit } = mockFetch(200, mergedMrFixture);

		await makeClient().mergePullRequest(REPO, PR_NUMBER, "rebase");

		const body = JSON.parse(getCapturedInit()?.body as string);
		// "rebase" maps to plain merge (squash=false) — documented simplification.
		expect(body.squash).toBe(false);
	});

	it("calls the correct GitLab API endpoint", async () => {
		const { getCapturedUrl } = mockFetch(200, mergedMrFixture);

		await makeClient().mergePullRequest(REPO, PR_NUMBER, "merge");

		expect(getCapturedUrl()).toBe(
			"https://gitlab.example.com/api/v4/projects/acme%2Fwidget/merge_requests/7/merge",
		);
	});

	it("uses PUT method for the merge request", async () => {
		const { getCapturedInit } = mockFetch(200, mergedMrFixture);

		await makeClient().mergePullRequest(REPO, PR_NUMBER, "merge");

		expect(getCapturedInit()?.method).toBe("PUT");
	});

	it("merged=false when the MR state is not 'merged'", async () => {
		mockFetch(200, { ...mergedMrFixture, state: "opened" });

		const result = await makeClient().mergePullRequest(
			REPO,
			PR_NUMBER,
			"merge",
		);

		expect(result.merged).toBe(false);
	});

	it("throws GitLabRestError on a non-ok response", async () => {
		mockFetch(405, { message: "Method Not Allowed" });

		await expect(
			makeClient().mergePullRequest(REPO, PR_NUMBER, "merge"),
		).rejects.toMatchObject({ status: 405 });
	});

	it("throws GitLabRestError(401) when token is null", async () => {
		// No fetch mock needed — gitlabRestPost checks token before calling fetch
		await expect(
			makeClient(null).mergePullRequest(REPO, PR_NUMBER, "merge"),
		).rejects.toMatchObject({ status: 401 });
	});
});

// ---------------------------------------------------------------------------
// fetchPullRequestMetadata
// ---------------------------------------------------------------------------

describe("GitLabProviderClient.fetchPullRequestMetadata", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetch(status: number, body: unknown) {
		globalThis.fetch = mock(async () => ({
			ok: status >= 200 && status < 300,
			status,
			json: async () => body,
		})) as unknown as typeof fetch;
	}

	const openMrFixture = {
		iid: 7,
		title: "feat: add widget",
		web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/7",
		state: "opened",
		draft: false,
		sha: "abc123def456789012345678901234567890abcd",
		source_branch: "feature/widget",
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

	it("maps basic MR fields to PullRequestCheckoutMetadata shape", async () => {
		mockFetch(200, openMrFixture);

		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);

		expect(meta.number).toBe(7);
		expect(meta.title).toBe("feat: add widget");
		expect(meta.url).toBe(openMrFixture.web_url);
		expect(meta.headRefName).toBe("feature/widget");
		expect(meta.headRefOid).toBe(openMrFixture.sha);
		expect(meta.baseRefName).toBe("main");
		expect(meta.state).toBe("open");
	});

	it("maps GitLab 'opened' state to 'open'", async () => {
		mockFetch(200, { ...openMrFixture, state: "opened" });
		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);
		expect(meta.state).toBe("open");
	});

	it("maps GitLab 'merged' state to 'merged'", async () => {
		mockFetch(200, { ...openMrFixture, state: "merged" });
		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);
		expect(meta.state).toBe("merged");
	});

	it("maps GitLab 'closed' state to 'closed'", async () => {
		mockFetch(200, { ...openMrFixture, state: "closed" });
		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);
		expect(meta.state).toBe("closed");
	});

	it("maps GitLab 'locked' state to 'closed' (catch-all)", async () => {
		mockFetch(200, { ...openMrFixture, state: "locked" });
		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);
		expect(meta.state).toBe("closed");
	});

	it("sets isCrossRepository=false for same-project MRs", async () => {
		mockFetch(200, openMrFixture);
		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);
		expect(meta.isCrossRepository).toBe(false);
	});

	it("sets headRepositoryOwner/Name from repo for same-project MRs", async () => {
		mockFetch(200, openMrFixture);
		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);
		expect(meta.headRepositoryOwner).toBe(REPO.owner);
		expect(meta.headRepositoryName).toBe(REPO.name);
	});

	it("sets isCrossRepository=true when source_project_id !== target_project_id", async () => {
		mockFetch(200, {
			...openMrFixture,
			source_project_id: 99,
			target_project_id: 1,
		});
		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);
		expect(meta.isCrossRepository).toBe(true);
	});

	it("resolves headRepositoryOwner/Name from fork project for cross-repo MRs", async () => {
		// Route-aware mock: MR endpoint returns a cross-repo MR; /projects/99
		// returns the fork project with its namespace.
		const crossRepoMr = {
			...openMrFixture,
			source_project_id: 99,
			target_project_id: 1,
		};
		globalThis.fetch = mock(async (url: string) => {
			const body = url.includes("/projects/99")
				? { path_with_namespace: "bob-fork/widget" }
				: crossRepoMr;
			return { ok: true, status: 200, json: async () => body } as Response;
		}) as unknown as typeof fetch;

		const meta = await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);
		expect(meta.isCrossRepository).toBe(true);
		expect(meta.headRepositoryOwner).toBe("bob-fork");
		expect(meta.headRepositoryName).toBe("widget");
	});

	it("calls the correct GitLab API endpoint", async () => {
		let capturedUrl = "";
		globalThis.fetch = mock(async (url: string) => {
			capturedUrl = url;
			return {
				ok: true,
				status: 200,
				json: async () => openMrFixture,
			} as Response;
		}) as unknown as typeof fetch;

		await makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER);

		expect(capturedUrl).toBe(
			"https://gitlab.example.com/api/v4/projects/acme%2Fwidget/merge_requests/7",
		);
	});

	it("throws GitLabRestError on a 404 (MR not found)", async () => {
		mockFetch(404, { message: "Not found" });

		await expect(
			makeClient().fetchPullRequestMetadata(REPO, PR_NUMBER),
		).rejects.toMatchObject({ status: 404 });
	});
});

// ---------------------------------------------------------------------------
// getAuthenticatedUser
// ---------------------------------------------------------------------------

describe("GitLabProviderClient.getAuthenticatedUser", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns { login: username } for a valid response", async () => {
		globalThis.fetch = mock(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ id: 42, username: "alice" }),
		})) as unknown as typeof fetch;

		const result = await makeClient().getAuthenticatedUser();

		expect(result).toEqual({ login: "alice" });
	});

	it("calls GET /user on the correct host", async () => {
		let capturedUrl = "";
		globalThis.fetch = mock(async (url: string) => {
			capturedUrl = url;
			return {
				ok: true,
				status: 200,
				json: async () => ({ username: "alice" }),
			} as Response;
		}) as unknown as typeof fetch;

		await makeClient().getAuthenticatedUser();

		expect(capturedUrl).toBe("https://gitlab.example.com/api/v4/user");
	});

	it("returns null on a network/auth error (does not throw)", async () => {
		globalThis.fetch = mock(async () => ({
			ok: false,
			status: 401,
			json: async () => ({ message: "Unauthorized" }),
		})) as unknown as typeof fetch;

		const result = await makeClient().getAuthenticatedUser();

		expect(result).toBeNull();
	});

	it("returns null when token is null (before fetch)", async () => {
		const result = await makeClient(null).getAuthenticatedUser();
		expect(result).toBeNull();
	});

	it("returns null when username is empty string", async () => {
		globalThis.fetch = mock(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ username: "" }),
		})) as unknown as typeof fetch;

		const result = await makeClient().getAuthenticatedUser();

		expect(result).toBeNull();
	});

	it("exposes login field matching the GitLab username", async () => {
		globalThis.fetch = mock(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ id: 99, username: "john_doe" }),
		})) as unknown as typeof fetch;

		const result = await makeClient().getAuthenticatedUser();

		expect(result?.login).toBe("john_doe");
	});
});
