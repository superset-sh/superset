import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SearchRepoRef } from "../types";
import {
	mapIssueToSummary,
	mapMrToSummary,
	searchIssuesGitLab,
	searchPullRequestsGitLab,
} from "./gitlab-search";

// ---------------------------------------------------------------------------
// Synthetic GitLab REST shapes (VALIDATED for MRs; DOCUMENTED for issues)
// ---------------------------------------------------------------------------

const BASE_MR = {
	iid: 42,
	title: "Add new feature",
	web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/42",
	state: "opened" as const,
	draft: false,
	description: "A detailed description",
	source_branch: "feature/new-thing",
	sha: "abc123",
	author: { username: "alice" },
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-02T00:00:00Z",
	target_branch: "main",
	source_project_id: 1,
	target_project_id: 1,
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

const REPO: SearchRepoRef = {
	owner: "acme",
	name: "widget",
	repoPath: "/tmp/widget",
};

// ---------------------------------------------------------------------------
// mapMrToSummary
// ---------------------------------------------------------------------------

describe("mapMrToSummary", () => {
	it("maps opened MR to state=open", () => {
		const result = mapMrToSummary({ ...BASE_MR, state: "opened" });
		expect(result.state).toBe("open");
	});

	it("maps locked MR to state=open", () => {
		const result = mapMrToSummary({ ...BASE_MR, state: "locked" });
		expect(result.state).toBe("open");
	});

	it("maps merged MR to state=merged", () => {
		const result = mapMrToSummary({ ...BASE_MR, state: "merged" });
		expect(result.state).toBe("merged");
	});

	it("maps closed MR to state=closed", () => {
		const result = mapMrToSummary({ ...BASE_MR, state: "closed" });
		expect(result.state).toBe("closed");
	});

	it("maps iid to prNumber", () => {
		const result = mapMrToSummary(BASE_MR);
		expect(result.prNumber).toBe(42);
	});

	it("maps web_url to url", () => {
		const result = mapMrToSummary(BASE_MR);
		expect(result.url).toBe(BASE_MR.web_url);
	});

	it("maps draft to isDraft", () => {
		const result = mapMrToSummary({ ...BASE_MR, draft: true });
		expect(result.isDraft).toBe(true);
	});

	it("maps author.username to authorLogin", () => {
		const result = mapMrToSummary(BASE_MR);
		expect(result.authorLogin).toBe("alice");
	});

	it("maps null author to null authorLogin", () => {
		const result = mapMrToSummary({
			...BASE_MR,
			author: undefined as unknown as { username: string },
		});
		expect(result.authorLogin).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// mapIssueToSummary
// ---------------------------------------------------------------------------

describe("mapIssueToSummary", () => {
	it("maps iid to issueNumber", () => {
		const result = mapIssueToSummary(BASE_ISSUE);
		expect(result.issueNumber).toBe(7);
	});

	it("maps title and web_url", () => {
		const result = mapIssueToSummary(BASE_ISSUE);
		expect(result.title).toBe("Something is broken");
		expect(result.url).toBe(BASE_ISSUE.web_url);
	});

	it("passes state through as lowercase", () => {
		const result = mapIssueToSummary({ ...BASE_ISSUE, state: "opened" });
		expect(result.state).toBe("opened");
	});

	it("maps closed state", () => {
		const result = mapIssueToSummary({
			...BASE_ISSUE,
			state: "closed" as const,
		});
		expect(result.state).toBe("closed");
	});

	it("maps author.username to authorLogin", () => {
		const result = mapIssueToSummary(BASE_ISSUE);
		expect(result.authorLogin).toBe("bob");
	});

	it("maps null author to null authorLogin", () => {
		const result = mapIssueToSummary({
			...BASE_ISSUE,
			author: undefined as unknown as { username: string },
		});
		expect(result.authorLogin).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// searchPullRequestsGitLab — fetch mocking helpers
// ---------------------------------------------------------------------------

function setupFetch(
	handler: (url: string) => {
		status: number;
		body: unknown;
		headers?: Record<string, string>;
	},
) {
	globalThis.fetch = mock(async (url: string) => {
		const { status, body, headers: hdrs = {} } = handler(url);
		const headerMap = new Map(Object.entries(hdrs));
		return {
			ok: status >= 200 && status < 300,
			status,
			headers: { get: (k: string) => headerMap.get(k.toLowerCase()) ?? null },
			json: async () => body,
		} as unknown as Response;
	}) as unknown as typeof fetch;
}

function makeDeps(token = "test-token") {
	return {
		host: "gitlab.example.com",
		token: async () => token,
	};
}

describe("searchPullRequestsGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("text search returns list mapped to PullRequestSummary", async () => {
		setupFetch(() => ({ status: 200, body: [BASE_MR] }));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {
			text: "feature",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0]?.prNumber).toBe(42);
		expect(result.pullRequests[0]?.title).toBe("Add new feature");
		expect(result.pullRequests[0]?.state).toBe("open");
	});

	it("includes search= param when text is provided", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, { text: "my query" });
		expect(capturedUrl).toContain("search=my+query");
	});

	it("omits search= param when text is empty", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, { text: "" });
		expect(capturedUrl).not.toContain("search=");
	});

	it("omits search= param when text is whitespace-only", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, { text: "   " });
		expect(capturedUrl).not.toContain("search=");
	});

	it("uses state=opened when includeClosed is false", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, { includeClosed: false });
		expect(capturedUrl).toContain("state=opened");
	});

	it("uses state=all when includeClosed is true", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, { includeClosed: true });
		expect(capturedUrl).toContain("state=all");
	});

	it("includes order_by=updated_at and sort=desc", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, {});
		expect(capturedUrl).toContain("order_by=updated_at");
		expect(capturedUrl).toContain("sort=desc");
	});

	it("uses default per_page=30 and page=1", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, {});
		expect(capturedUrl).toContain("per_page=30");
		expect(capturedUrl).toContain("page=1");
	});

	it("uses provided limit and page", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, { limit: 10, page: 3 });
		expect(capturedUrl).toContain("per_page=10");
		expect(capturedUrl).toContain("page=3");
	});

	it("hasNextPage is true when items.length equals per_page", async () => {
		// Return 30 items (= per_page default 30) → has next page
		const items = Array.from({ length: 30 }, (_, i) => ({
			...BASE_MR,
			iid: i + 1,
		}));
		setupFetch(() => ({ status: 200, body: items }));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {});
		expect(result.hasNextPage).toBe(true);
	});

	it("hasNextPage is false when items.length is less than per_page", async () => {
		setupFetch(() => ({ status: 200, body: [BASE_MR] }));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {});
		expect(result.hasNextPage).toBe(false);
	});

	it("returns correct page number", async () => {
		setupFetch(() => ({ status: 200, body: [] }));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {
			page: 2,
		});
		expect(result.page).toBe(2);
	});

	it("direct-number lookup: bare number does single GET /merge_requests/:iid", async () => {
		const capturedUrls: string[] = [];
		setupFetch((url) => {
			capturedUrls.push(url);
			return { status: 200, body: BASE_MR };
		});
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {
			text: "42",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0]?.prNumber).toBe(42);
		// Should call single MR endpoint, not list
		expect(capturedUrls[0]).toContain("/merge_requests/42");
		expect(capturedUrls[0]).not.toContain("search=");
	});

	it("direct-number lookup: # prefix also triggers single GET", async () => {
		const capturedUrls: string[] = [];
		setupFetch((url) => {
			capturedUrls.push(url);
			return { status: 200, body: BASE_MR };
		});
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {
			text: "#42",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(capturedUrls[0]).toContain("/merge_requests/42");
	});

	it("direct-number lookup: 404 returns empty page", async () => {
		setupFetch(() => ({ status: 404, body: { message: "Not found" } }));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {
			text: "9999",
		});
		expect(result.pullRequests).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(result.hasNextPage).toBe(false);
	});

	it("does not set repoMismatch (GitLab is project-scoped)", async () => {
		setupFetch(() => ({ status: 200, body: [BASE_MR] }));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {
			text: "feature",
		});
		expect(result.repoMismatch).toBeUndefined();
	});

	it("calls the correct GitLab project endpoint", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchPullRequestsGitLab(makeDeps(), REPO, { text: "fix" });
		expect(capturedUrl).toContain("/projects/acme%2Fwidget/merge_requests");
	});

	// X-Total / X-Total-Pages header tests
	it("uses X-Total header for totalCount when present", async () => {
		setupFetch(() => ({
			status: 200,
			body: [BASE_MR],
			headers: { "x-total": "99", "x-total-pages": "4" },
		}));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {});
		expect(result.totalCount).toBe(99);
	});

	it("hasNextPage=true when page < totalPages from header", async () => {
		setupFetch(() => ({
			status: 200,
			body: [BASE_MR],
			headers: { "x-total": "99", "x-total-pages": "4" },
		}));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {
			page: 2,
		});
		expect(result.hasNextPage).toBe(true);
	});

	it("hasNextPage=false when page >= totalPages from header", async () => {
		setupFetch(() => ({
			status: 200,
			body: [BASE_MR],
			headers: { "x-total": "99", "x-total-pages": "4" },
		}));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {
			page: 4,
		});
		expect(result.hasNextPage).toBe(false);
	});

	it("falls back to items.length===per_page when X-Total-Pages absent", async () => {
		// 30 items, no header → approximation: items.length === per_page
		const items = Array.from({ length: 30 }, (_, i) => ({
			...BASE_MR,
			iid: i + 1,
		}));
		setupFetch(() => ({ status: 200, body: items }));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {});
		expect(result.hasNextPage).toBe(true);
		expect(result.totalCount).toBe(30); // items.length when no X-Total
	});
});

// ---------------------------------------------------------------------------
// searchIssuesGitLab
// ---------------------------------------------------------------------------

describe("searchIssuesGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("text search returns list mapped to IssueSummary", async () => {
		setupFetch(() => ({ status: 200, body: [BASE_ISSUE] }));
		const result = await searchIssuesGitLab(makeDeps(), REPO, {
			text: "broken",
		});
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.issueNumber).toBe(7);
		expect(result.issues[0]?.title).toBe("Something is broken");
		expect(result.issues[0]?.state).toBe("opened");
	});

	it("calls the correct GitLab issues endpoint", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchIssuesGitLab(makeDeps(), REPO, {});
		expect(capturedUrl).toContain("/projects/acme%2Fwidget/issues");
	});

	it("includes search= param when text is provided", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchIssuesGitLab(makeDeps(), REPO, { text: "crash" });
		expect(capturedUrl).toContain("search=crash");
	});

	it("omits search= param when text is empty", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchIssuesGitLab(makeDeps(), REPO, { text: "" });
		expect(capturedUrl).not.toContain("search=");
	});

	it("uses state=opened when includeClosed is false", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchIssuesGitLab(makeDeps(), REPO, { includeClosed: false });
		expect(capturedUrl).toContain("state=opened");
	});

	it("uses state=all when includeClosed is true", async () => {
		let capturedUrl = "";
		setupFetch((url) => {
			capturedUrl = url;
			return { status: 200, body: [] };
		});
		await searchIssuesGitLab(makeDeps(), REPO, { includeClosed: true });
		expect(capturedUrl).toContain("state=all");
	});

	it("hasNextPage is true when items.length equals per_page", async () => {
		const items = Array.from({ length: 30 }, (_, i) => ({
			...BASE_ISSUE,
			iid: i + 1,
		}));
		setupFetch(() => ({ status: 200, body: items }));
		const result = await searchIssuesGitLab(makeDeps(), REPO, {});
		expect(result.hasNextPage).toBe(true);
	});

	it("hasNextPage is false when items.length is less than per_page", async () => {
		setupFetch(() => ({ status: 200, body: [BASE_ISSUE] }));
		const result = await searchIssuesGitLab(makeDeps(), REPO, {});
		expect(result.hasNextPage).toBe(false);
	});

	it("direct-number lookup: bare number does single GET /issues/:iid", async () => {
		const capturedUrls: string[] = [];
		setupFetch((url) => {
			capturedUrls.push(url);
			return { status: 200, body: BASE_ISSUE };
		});
		const result = await searchIssuesGitLab(makeDeps(), REPO, { text: "7" });
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.issueNumber).toBe(7);
		expect(capturedUrls[0]).toContain("/issues/7");
	});

	it("direct-number lookup: # prefix also triggers single GET", async () => {
		const capturedUrls: string[] = [];
		setupFetch((url) => {
			capturedUrls.push(url);
			return { status: 200, body: BASE_ISSUE };
		});
		const result = await searchIssuesGitLab(makeDeps(), REPO, { text: "#7" });
		expect(result.issues).toHaveLength(1);
		expect(capturedUrls[0]).toContain("/issues/7");
	});

	it("direct-number lookup: 404 returns empty page", async () => {
		setupFetch(() => ({ status: 404, body: { message: "Not found" } }));
		const result = await searchIssuesGitLab(makeDeps(), REPO, { text: "9999" });
		expect(result.issues).toEqual([]);
		expect(result.totalCount).toBe(0);
	});

	it("does not set repoMismatch", async () => {
		setupFetch(() => ({ status: 200, body: [] }));
		const result = await searchIssuesGitLab(makeDeps(), REPO, {});
		expect(result.repoMismatch).toBeUndefined();
	});

	it("returns correct page number", async () => {
		setupFetch(() => ({ status: 200, body: [] }));
		const result = await searchIssuesGitLab(makeDeps(), REPO, { page: 3 });
		expect(result.page).toBe(3);
	});

	// X-Total / X-Total-Pages header tests (issues)
	it("uses X-Total header for totalCount when present", async () => {
		setupFetch(() => ({
			status: 200,
			body: [BASE_ISSUE],
			headers: { "x-total": "55", "x-total-pages": "2" },
		}));
		const result = await searchIssuesGitLab(makeDeps(), REPO, {});
		expect(result.totalCount).toBe(55);
	});

	it("hasNextPage=true when page < totalPages from header", async () => {
		setupFetch(() => ({
			status: 200,
			body: [BASE_ISSUE],
			headers: { "x-total": "55", "x-total-pages": "2" },
		}));
		const result = await searchIssuesGitLab(makeDeps(), REPO, { page: 1 });
		expect(result.hasNextPage).toBe(true);
	});

	it("hasNextPage=false when page === totalPages from header", async () => {
		setupFetch(() => ({
			status: 200,
			body: [BASE_ISSUE],
			headers: { "x-total": "55", "x-total-pages": "2" },
		}));
		const result = await searchIssuesGitLab(makeDeps(), REPO, { page: 2 });
		expect(result.hasNextPage).toBe(false);
	});
});
