import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	encodeProjectPath,
	GitLabRestError,
	gitlabRest,
	gitlabRestWithMeta,
} from "./gitlab-rest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(token: string | null = "tok-123") {
	return {
		host: "gitlab.example.com",
		token: async () => token,
	};
}

// ---------------------------------------------------------------------------
// encodeProjectPath
// ---------------------------------------------------------------------------

describe("encodeProjectPath", () => {
	it("encodes a flat owner/name", () => {
		expect(encodeProjectPath("acme", "widget")).toBe("acme%2Fwidget");
	});

	it("encodes a subgroup path (a/b/c → a%2Fb%2Fc)", () => {
		expect(encodeProjectPath("a/b", "c")).toBe("a%2Fb%2Fc");
	});
});

// ---------------------------------------------------------------------------
// gitlabRest — URL + header construction
// ---------------------------------------------------------------------------

describe("gitlabRest", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetch(
		status: number,
		body: unknown,
		spy?: (url: string, init?: RequestInit) => void,
	) {
		globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
			spy?.(url, init);
			return {
				ok: status >= 200 && status < 300,
				status,
				json: async () => body,
			} as Response;
		}) as unknown as typeof fetch;
	}

	it("builds the correct URL with Bearer header", async () => {
		let capturedUrl = "";
		let capturedInit: RequestInit | undefined;
		mockFetch(200, { id: 1 }, (url, init) => {
			capturedUrl = url;
			capturedInit = init;
		});

		await gitlabRest(makeDeps(), "/projects/42/merge_requests");

		expect(capturedUrl).toBe(
			"https://gitlab.example.com/api/v4/projects/42/merge_requests",
		);
		expect(capturedInit?.headers).toMatchObject({
			Authorization: "Bearer tok-123",
			Accept: "application/json",
		});
	});

	it("appends query params to the URL", async () => {
		let capturedUrl = "";
		mockFetch(200, [], (url) => {
			capturedUrl = url;
		});

		await gitlabRest(makeDeps(), "/projects/42/merge_requests", {
			state: "all",
			per_page: 10,
		});

		const parsed = new URL(capturedUrl);
		expect(parsed.searchParams.get("state")).toBe("all");
		expect(parsed.searchParams.get("per_page")).toBe("10");
	});

	it("omits undefined params", async () => {
		let capturedUrl = "";
		mockFetch(200, [], (url) => {
			capturedUrl = url;
		});

		await gitlabRest(makeDeps(), "/projects/1/merge_requests", {
			state: "all",
			ref: undefined,
		});

		const parsed = new URL(capturedUrl);
		expect(parsed.searchParams.has("ref")).toBe(false);
		expect(parsed.searchParams.get("state")).toBe("all");
	});

	it("throws GitLabRestError(401) when token is null (before fetch)", async () => {
		let fetchCalled = false;
		mockFetch(200, {}, () => {
			fetchCalled = true;
		});

		await expect(
			gitlabRest(makeDeps(null), "/projects/1/merge_requests"),
		).rejects.toThrow(GitLabRestError);

		await expect(
			gitlabRest(makeDeps(null), "/projects/1/merge_requests"),
		).rejects.toMatchObject({ status: 401 });

		expect(fetchCalled).toBe(false);
	});

	it("throws GitLabRestError on a non-ok response", async () => {
		mockFetch(404, { message: "Not found" });

		await expect(
			gitlabRest(makeDeps(), "/projects/1/merge_requests/99"),
		).rejects.toThrow(GitLabRestError);

		await expect(
			gitlabRest(makeDeps(), "/projects/1/merge_requests/99"),
		).rejects.toMatchObject({ status: 404 });
	});

	it("returns parsed JSON on a 200 response", async () => {
		const payload = [{ iid: 1, title: "MR title" }];
		mockFetch(200, payload);

		const result = await gitlabRest(makeDeps(), "/projects/42/merge_requests");
		expect(result).toEqual(payload);
	});
});

// ---------------------------------------------------------------------------
// gitlabRestWithMeta — X-Total / X-Total-Pages header parsing
// ---------------------------------------------------------------------------

describe("gitlabRestWithMeta", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetchWithHeaders(
		status: number,
		body: unknown,
		headers: Record<string, string> = {},
	) {
		globalThis.fetch = mock(async () => {
			const headerMap = new Map(Object.entries(headers));
			return {
				ok: status >= 200 && status < 300,
				status,
				headers: {
					get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
				},
				json: async () => body,
			} as unknown as Response;
		}) as unknown as typeof fetch;
	}

	it("returns data + null pagination when headers are absent", async () => {
		const payload = [{ iid: 1 }];
		mockFetchWithHeaders(200, payload);

		const result = await gitlabRestWithMeta(
			makeDeps(),
			"/projects/1/merge_requests",
		);
		expect(result.data).toEqual(payload);
		expect(result.total).toBeNull();
		expect(result.totalPages).toBeNull();
	});

	it("parses X-Total and X-Total-Pages when present", async () => {
		const payload = [{ iid: 1 }, { iid: 2 }];
		mockFetchWithHeaders(200, payload, {
			"x-total": "42",
			"x-total-pages": "3",
		});

		const result = await gitlabRestWithMeta(
			makeDeps(),
			"/projects/1/merge_requests",
		);
		expect(result.data).toEqual(payload);
		expect(result.total).toBe(42);
		expect(result.totalPages).toBe(3);
	});

	it("throws GitLabRestError(401) when token is null", async () => {
		mockFetchWithHeaders(200, {});

		await expect(
			gitlabRestWithMeta(makeDeps(null), "/projects/1/merge_requests"),
		).rejects.toMatchObject({ status: 401 });
	});

	it("throws GitLabRestError on a non-ok response", async () => {
		mockFetchWithHeaders(404, { message: "Not found" });

		await expect(
			gitlabRestWithMeta(makeDeps(), "/projects/1/merge_requests/99"),
		).rejects.toMatchObject({ status: 404 });
	});
});
