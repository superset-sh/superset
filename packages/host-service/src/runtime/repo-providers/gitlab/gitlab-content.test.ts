import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { RepoRef } from "../types";
import {
	fetchIssueContentGitLab,
	fetchPullRequestContentGitLab,
} from "./gitlab-content";

// ---------------------------------------------------------------------------
// Synthetic shapes (VALIDATED for MRs; DOCUMENTED for issues)
// ---------------------------------------------------------------------------

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
	globalThis.fetch = mock(async () => ({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	})) as unknown as typeof fetch;
}

function makeDeps(token = "test-token") {
	return {
		host: "gitlab.example.com",
		token: async () => token,
	};
}

// ---------------------------------------------------------------------------
// fetchPullRequestContentGitLab
// ---------------------------------------------------------------------------

describe("fetchPullRequestContentGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("happy path: maps all fields correctly for same-project MR", async () => {
		setupFetch(BASE_MR);
		const result = await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(result).toEqual({
			number: 42,
			title: "Add new feature",
			body: "A detailed description",
			url: "https://gitlab.example.com/acme/widget/-/merge_requests/42",
			state: "opened",
			branch: "feature/new-thing",
			baseBranch: "main",
			headRepositoryOwner: "acme",
			isCrossRepository: false,
			author: "alice",
			isDraft: false,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-02T00:00:00Z",
		});
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

	it("cross-repository: headRepositoryOwner=null when source_project_id !== target_project_id", async () => {
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
		let capturedUrl = "";
		globalThis.fetch = mock(async (url: string) => {
			capturedUrl = url;
			return {
				ok: true,
				status: 200,
				json: async () => BASE_MR,
			} as Response;
		}) as unknown as typeof fetch;

		await fetchPullRequestContentGitLab(makeDeps(), REPO, 42);
		expect(capturedUrl).toContain("/projects/acme%2Fwidget/merge_requests/42");
	});

	it("rejects on 404", async () => {
		setupFetch({ message: "Not found" }, 404);
		await expect(
			fetchPullRequestContentGitLab(makeDeps(), REPO, 9999),
		).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// fetchIssueContentGitLab
// ---------------------------------------------------------------------------

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
