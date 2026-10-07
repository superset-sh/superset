import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SearchRepoRef } from "../types";
import {
	mapIssueToSummary,
	mapMrToSummary,
	searchIssuesGitLab,
	searchPullRequestsGitLab,
} from "./gitlab-search";

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

	it.each([
		"0",
		"#0",
		"9007199254740993",
	])("rejects invalid direct IID %s without making a request", async (text) => {
		const fetch = mock(async () => Response.json({}));
		globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
		await expect(
			searchPullRequestsGitLab(makeDeps(), REPO, { text }),
		).rejects.toMatchObject({ status: 422 });
		await expect(
			searchIssuesGitLab(makeDeps(), REPO, { text }),
		).rejects.toMatchObject({ status: 422 });
		expect(fetch).not.toHaveBeenCalled();
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
		const items = Array.from({ length: 30 }, (_, i) => ({
			...BASE_MR,
			iid: i + 1,
		}));
		setupFetch(() => ({ status: 200, body: items }));
		const result = await searchPullRequestsGitLab(makeDeps(), REPO, {});
		expect(result.hasNextPage).toBe(true);
		expect(result.totalCount).toBe(30);
	});
});

describe("searchIssuesGitLab", () => {
	it("recently updated issue remains on page one rather than its created page", async () => {
		const seen: URL[] = [];
		setupFetch((raw) => {
			const url = new URL(raw);
			seen.push(url);
			const newest =
				url.searchParams.get("order_by") === "updated_at" &&
				url.searchParams.get("sort") === "desc";
			const page = url.searchParams.get("page");
			return {
				status: 200,
				body: [
					{
						...BASE_ISSUE,
						iid: page === "1" ? (newest ? 7 : 8) : newest ? 8 : 7,
					},
				],
				headers: { "x-total": "2", "x-next-page": page === "1" ? "2" : "" },
			};
		});
		const first = await searchIssuesGitLab(makeDeps(), REPO, {
			page: 1,
			limit: 1,
		});
		const second = await searchIssuesGitLab(makeDeps(), REPO, {
			page: 2,
			limit: 1,
		});
		expect(first.issues[0]?.issueNumber).toBe(7);
		expect(second.issues[0]?.issueNumber).toBe(8);
		expect(first.hasNextPage).toBe(true);
		expect(second.hasNextPage).toBe(false);
		expect(
			seen.every(
				(url) =>
					url.searchParams.get("order_by") === "updated_at" &&
					url.searchParams.get("sort") === "desc",
			),
		).toBe(true);
	});

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

describe("native author and current-cycle review filters", () => {
	let originalFetch: typeof fetch;
	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});
	const filtered = (
		gitlab: NonNullable<import("../types").PullRequestSearchFilters["gitlab"]>,
		other = {},
	) => ({ gitlab, ...other });
	it("delegates a native underscore author and preserves API pagination", async () => {
		let request: URL | undefined;
		setupFetch((raw) => {
			request = new URL(raw);
			return {
				status: 200,
				body: [BASE_MR],
				headers: { "x-total": "5000", "x-next-page": "3" },
			};
		});
		const result = await searchPullRequestsGitLab(
			makeDeps(),
			REPO,
			filtered({ author: ["@native_user"] }, { page: 2, limit: 2 }),
		);
		expect(request?.searchParams.get("author_username")).toBe("native_user");
		expect(request?.searchParams.get("page")).toBe("2");
		expect(result).toMatchObject({
			totalCount: 5000,
			hasNextPage: true,
			page: 2,
		});
	});
	it("resolves @me on the selected host before author search", async () => {
		const paths: string[] = [];
		setupFetch((raw) => {
			const url = new URL(raw);
			paths.push(url.pathname);
			return {
				status: 200,
				body: url.pathname.endsWith("/user")
					? { id: 5, username: "native_me" }
					: [BASE_MR],
				headers: { "x-total": "1", "x-next-page": "" },
			};
		});
		await searchPullRequestsGitLab(
			makeDeps(),
			REPO,
			filtered({ author: ["@me"] }),
		);
		expect(paths[0]).toBe("/api/v4/user");
	});
	it("does not turn current-user 401 into no matches", async () => {
		setupFetch(() => ({ status: 401, body: {} }));
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ viewerRelationship: "authored" }),
			),
		).rejects.toMatchObject({ status: 401 });
	});
	it("scans every candidate page for OR authors then slices the filtered order", async () => {
		const pages: string[] = [];
		setupFetch((raw) => {
			const url = new URL(raw);
			const page = url.searchParams.get("page");
			pages.push(page ?? "");
			return {
				status: 200,
				body:
					page === "1"
						? [
								{ ...BASE_MR, iid: 1, author: { username: "other" } },
								{
									...BASE_MR,
									iid: 2,
									author: { username: "alice" },
									updated_at: "2026-10-02",
								},
							]
						: [
								{
									...BASE_MR,
									iid: 3,
									author: { username: "BOB" },
									updated_at: "2026-10-03",
								},
							],
				headers: { "x-next-page": page === "1" ? "2" : "" },
			};
		});
		const result = await searchPullRequestsGitLab(
			makeDeps(),
			REPO,
			filtered({ author: ["alice", "bob"] }, { page: 2, limit: 1 }),
		);
		expect(pages).toEqual(["1", "2"]);
		expect(result.pullRequests.map((r) => r.prNumber)).toEqual([2]);
		expect(result).toMatchObject({ totalCount: 2, hasNextPage: false });
	});
	it("uses top-level reviewer state, not active account state or assignment", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: 200,
				body: path.endsWith("/reviewers")
					? [
							{
								user: { username: "alice", state: "active" },
								state: "reviewed",
							},
						]
					: path.endsWith("/approval_state")
						? { rules: [] }
						: path.endsWith("/approvals")
							? { approved_by: [] }
							: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		const result = await searchPullRequestsGitLab(
			makeDeps(),
			REPO,
			filtered({ review: "required" }),
		);
		await expect(Promise.resolve(result)).resolves.toMatchObject({
			totalCount: 0,
		});
	});
	it("re-requested review is pending even when an earlier approval remains", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: 200,
				body: path.endsWith("/user")
					? { id: 1, username: "alice" }
					: path.endsWith("/reviewers")
						? [{ user: { username: "alice" }, state: "unreviewed" }]
						: path.endsWith("/approvals")
							? { approved_by: [{ user: { username: "alice" } }] }
							: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		const result = await searchPullRequestsGitLab(
			makeDeps(),
			REPO,
			filtered({ viewerRelationship: "reviewed" }),
		);
		expect(result.totalCount).toBe(0);
	});
	it("requires actual satisfied approval rules rather than any approval", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: 200,
				body: path.endsWith("/reviewers")
					? []
					: path.endsWith("/approvals")
						? { approved: true, approved_by: [{ user: { username: "alice" } }] }
						: path.endsWith("/approval_state")
							? { rules: [{ approved: false, approvals_required: 2 }] }
							: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		expect(
			(
				await searchPullRequestsGitLab(
					makeDeps(),
					REPO,
					filtered({ review: "approved" }),
				)
			).totalCount,
		).toBe(0);
	});
	it("fails explicitly when required approval facts are unavailable", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: path.endsWith("/approval_state") ? 404 : 200,
				body: path.endsWith("/reviewers")
					? []
					: path.endsWith("/approvals")
						? { approved_by: [] }
						: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ review: "required" }),
			),
		).rejects.toMatchObject({ name: "GitLabSearchFilterError" });
	});
	it("fails closed on an unknown review state", async () => {
		setupFetch((raw) => ({
			status: 200,
			body: new URL(raw).pathname.endsWith("/reviewers")
				? [{ user: { username: "alice" }, state: "future_state" }]
				: [BASE_MR],
			headers: { "x-next-page": "" },
		}));
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ review: "changes-requested" }),
			),
		).rejects.toMatchObject({ name: "GitLabSearchFilterError" });
	});
	it("refuses candidate overflow instead of returning partial counts", async () => {
		setupFetch((raw) => {
			const page = Number(new URL(raw).searchParams.get("page"));
			return {
				status: 200,
				body: Array.from({ length: 100 }, (_, i) => ({
					...BASE_MR,
					iid: (page - 1) * 100 + i + 1,
				})),
				headers: { "x-next-page": String(page + 1) },
			};
		});
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ author: ["alice", "bob"] }),
			),
		).rejects.toMatchObject({
			name: "GitLabSearchFilterError",
			message: expect.stringContaining("Narrow"),
		});
	});
	it("applies filters to direct IID without swallowing fact-endpoint 404", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return { status: path.endsWith("/reviewers") ? 404 : 200, body: BASE_MR };
		});
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ review: "none" }, { text: "#42" }),
			),
		).rejects.toMatchObject({ status: 404 });
	});
	it("refuses GitHub team-review semantics before API access", async () => {
		const request = mock(() => ({ status: 200, body: [BASE_MR] }));
		setupFetch(request);
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ review: "team-review-requested" }),
			),
		).rejects.toMatchObject({ name: "GitLabSearchFilterError" });
		expect(request).not.toHaveBeenCalled();
	});
	it("counts distinct MR candidates even when concurrent updates repeat rows across pages", async () => {
		setupFetch((raw) => {
			const page = Number(new URL(raw).searchParams.get("page"));
			return {
				status: 200,
				body: Array.from({ length: 100 }, (_, i) => ({
					...BASE_MR,
					iid: page < 11 ? (page - 1) * 100 + i + 1 : 1000,
					author: { username: "alice" },
				})),
				headers: { "x-next-page": page < 11 ? String(page + 1) : "" },
			};
		});
		const result = await searchPullRequestsGitLab(
			makeDeps(),
			REPO,
			filtered({ author: ["alice", "bob"] }),
		);
		expect(result.totalCount).toBe(1000);
	});
	it("limits page traversal even when a provider keeps repeating a single candidate", async () => {
		let requests = 0;
		setupFetch(() => {
			requests++;
			return {
				status: 200,
				body: [BASE_MR],
				headers: { "x-next-page": String(requests + 1) },
			};
		});
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ author: ["alice", "bob"] }),
			),
		).rejects.toMatchObject({ name: "GitLabSearchFilterError" });
		expect(requests).toBe(100);
	});
	it("uses completed current review facts without requiring an unavailable approval API", async () => {
		const paths: string[] = [];
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			paths.push(path);
			return {
				status: path.endsWith("/approvals") ? 403 : 200,
				body: path.endsWith("/user")
					? { username: "alice" }
					: path.endsWith("/reviewers")
						? [
								{
									user: { username: "alice", state: "blocked" },
									state: "reviewed",
								},
							]
						: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		expect(
			(
				await searchPullRequestsGitLab(
					makeDeps(),
					REPO,
					filtered({ review: "reviewed-by-me" }),
				)
			).totalCount,
		).toBe(1);
		expect(paths.some((path) => path.endsWith("/approvals"))).toBe(false);
	});
	it("does not start more candidate fact requests after one candidate fails", async () => {
		let facts = 0;
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			if (path.endsWith("/reviewers")) {
				facts++;
				return { status: 503, body: {} };
			}
			return {
				status: 200,
				body: Array.from({ length: 20 }, (_, i) => ({
					...BASE_MR,
					iid: i + 1,
				})),
				headers: { "x-next-page": "" },
			};
		});
		await expect(
			searchPullRequestsGitLab(makeDeps(), REPO, filtered({ review: "none" })),
		).rejects.toMatchObject({ status: 503 });
		await Promise.resolve();
		await Promise.resolve();
		expect(facts).toBeLessThanOrEqual(4);
	});

	it.each([
		["review-requested", "unreviewed", true],
		["review-requested", "review_started", true],
		["review-requested", "approved", false],
		["review-requested", "unapproved", false],
		["reviewed-by-me", "reviewed", true],
		["reviewed-by-me", "approved", true],
		["reviewed-by-me", "requested_changes", true],
		["reviewed-by-me", "unapproved", false],
		["not-reviewed-by-me", "unreviewed", true],
		["not-reviewed-by-me", "reviewed", false],
		["changes-requested", "requested_changes", true],
		["changes-requested", "approved", false],
	] as const)("matches native %s against actual %s state", async (review, state, expected) => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: 200,
				body: path.endsWith("/user")
					? { username: "alice" }
					: path.endsWith("/reviewers")
						? [{ user: { username: "ALICE", state: "active" }, state }]
						: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		expect(
			(await searchPullRequestsGitLab(makeDeps(), REPO, filtered({ review })))
				.totalCount,
		).toBe(expected ? 1 : 0);
	});
	it("accepts approved only with real approvals and satisfied authoritative rules", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: 200,
				body: path.endsWith("/reviewers")
					? []
					: path.endsWith("/approvals")
						? { approved: true, approved_by: [{ user: { username: "alice" } }] }
						: path.endsWith("/approval_state")
							? { rules: [{ approvals_required: 2, approved: true }] }
							: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		expect(
			(
				await searchPullRequestsGitLab(
					makeDeps(),
					REPO,
					filtered({ review: "approved" }),
				)
			).totalCount,
		).toBe(1);
	});
	it("uses pending-review facts without assuming absent approval rules", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: 200,
				body: path.endsWith("/reviewers")
					? [{ user: { username: "alice" }, state: "review_started" }]
					: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		expect(
			(
				await searchPullRequestsGitLab(
					makeDeps(),
					REPO,
					filtered({ review: "required" }),
				)
			).totalCount,
		).toBe(1);
	});
	it("follows reviewer pagination before deciding whether changes were requested", async () => {
		const pages: string[] = [];
		setupFetch((raw) => {
			const url = new URL(raw);
			const reviewer = url.pathname.endsWith("/reviewers");
			const page = url.searchParams.get("page");
			if (reviewer) pages.push(page ?? "");
			return {
				status: 200,
				body: reviewer
					? [
							{
								user: { username: "alice" },
								state: page === "1" ? "reviewed" : "requested_changes",
							},
						]
					: [BASE_MR],
				headers: { "x-next-page": reviewer && page === "1" ? "2" : "" },
			};
		});
		expect(
			(
				await searchPullRequestsGitLab(
					makeDeps(),
					REPO,
					filtered({ review: "changes-requested" }),
				)
			).totalCount,
		).toBe(1);
		expect(pages).toEqual(["1", "2"]);
	});
	it("computes an exact filtered total when the delegated author API omits totals", async () => {
		setupFetch((raw) => {
			const page = Number(new URL(raw).searchParams.get("page"));
			return {
				status: 200,
				body: page === 2 ? [{ ...BASE_MR, iid: 2 }] : [BASE_MR],
				headers: { "x-next-page": page === 1 ? "2" : "" },
			};
		});
		const result = await searchPullRequestsGitLab(
			makeDeps(),
			REPO,
			filtered({ author: ["alice"] }, { limit: 1, page: 2 }),
		);
		expect(result).toMatchObject({
			totalCount: 2,
			hasNextPage: false,
			page: 2,
		});
		expect(result.pullRequests[0]?.prNumber).toBe(2);
	});
	it.each([
		"0",
		"1",
		"NaN",
	])("rejects non-forward reviewer pagination %s", async (next) => {
		setupFetch((raw) => ({
			status: 200,
			body: new URL(raw).pathname.endsWith("/reviewers")
				? [{ user: { username: "alice" }, state: "reviewed" }]
				: [BASE_MR],
			headers: {
				"x-next-page": new URL(raw).pathname.endsWith("/reviewers") ? next : "",
			},
		}));
		await expect(
			searchPullRequestsGitLab(makeDeps(), REPO, filtered({ review: "none" })),
		).rejects.toMatchObject({ status: 502 });
	});
	it("evaluates facts with at most four concurrent requests", async () => {
		let active = 0;
		let maximum = 0;
		const rows = Array.from({ length: 9 }, (_, i) => ({
			...BASE_MR,
			iid: i + 1,
		}));
		globalThis.fetch = mock(async (raw: string) => {
			const url = new URL(raw);
			if (!url.pathname.endsWith("/reviewers"))
				return Response.json(rows, { headers: { "x-next-page": "" } });
			active++;
			maximum = Math.max(maximum, active);
			await new Promise((resolve) => setTimeout(resolve, 1));
			active--;
			return Response.json(
				[{ user: { username: "alice" }, state: "requested_changes" }],
				{ headers: { "x-next-page": "" } },
			);
		}) as unknown as typeof fetch;
		expect(
			(
				await searchPullRequestsGitLab(
					makeDeps(),
					REPO,
					filtered({ review: "changes-requested" }),
				)
			).totalCount,
		).toBe(9);
		expect(maximum).toBe(4);
	});
	it.each([
		undefined,
		NaN,
		-1,
		0,
		Number.MAX_SAFE_INTEGER + 1,
	])("rejects malformed filtered MR identity %s before review facts", async (iid) => {
		const paths: string[] = [];
		setupFetch((raw) => {
			paths.push(new URL(raw).pathname);
			return {
				status: 200,
				body: [{ ...BASE_MR, iid }],
				headers: { "x-next-page": "" },
			};
		});
		await expect(
			searchPullRequestsGitLab(makeDeps(), REPO, filtered({ review: "none" })),
		).rejects.toMatchObject({ status: 502 });
		expect(paths).toEqual(["/api/v4/projects/acme%2Fwidget/merge_requests"]);
	});
	it.each([
		undefined,
		"",
		"invalid date",
	])("rejects malformed filtered MR updated timestamp %s", async (updated_at) => {
		setupFetch(() => ({
			status: 200,
			body: [{ ...BASE_MR, updated_at }],
			headers: { "x-next-page": "" },
		}));
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ author: ["alice", "bob"] }),
			),
		).rejects.toMatchObject({ status: 502 });
	});
	it("validates a delegated author page before mapping its rows", async () => {
		setupFetch(() => ({
			status: 200,
			body: [{ ...BASE_MR, iid: -1 }],
			headers: { "x-total": "1", "x-next-page": "" },
		}));
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ author: ["alice"] }),
			),
		).rejects.toMatchObject({ status: 502 });
	});
	it("validates direct lookup identity before dispatching review facts", async () => {
		let requests = 0;
		setupFetch(() => {
			requests++;
			return { status: 200, body: { ...BASE_MR, iid: undefined } };
		});
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ review: "none" }, { text: "#42" }),
			),
		).rejects.toMatchObject({ status: 502 });
		expect(requests).toBe(1);
	});
	it("refuses native approved=false even with approval users and satisfied rules", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: 200,
				body: path.endsWith("/reviewers")
					? []
					: path.endsWith("/approvals")
						? {
								approved: false,
								approved_by: [{ user: { username: "alice" } }],
							}
						: path.endsWith("/approval_state")
							? { rules: [{ approvals_required: 1, approved: true }] }
							: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		expect(
			(
				await searchPullRequestsGitLab(
					makeDeps(),
					REPO,
					filtered({ review: "approved" }),
				)
			).totalCount,
		).toBe(0);
	});
	it("fails explicitly when native approval verdict is unknown", async () => {
		setupFetch((raw) => {
			const path = new URL(raw).pathname;
			return {
				status: 200,
				body: path.endsWith("/reviewers")
					? []
					: path.endsWith("/approvals")
						? { approved_by: [{ user: { username: "alice" } }] }
						: path.endsWith("/approval_state")
							? { rules: [{ approvals_required: 1, approved: true }] }
							: [BASE_MR],
				headers: { "x-next-page": "" },
			};
		});
		await expect(
			searchPullRequestsGitLab(
				makeDeps(),
				REPO,
				filtered({ review: "approved" }),
			),
		).rejects.toMatchObject({ name: "GitLabSearchFilterError" });
	});
});
