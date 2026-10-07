import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	test,
} from "bun:test";
import {
	encodeProjectPath,
	GitLabRestError,
	gitlabRest,
	gitlabRestAll,
	gitlabRestPost,
	gitlabRestWithMeta,
	resolveForkSourceProject,
} from "./gitlab-rest";

function makeDeps(token: string | null = "tok-123") {
	return {
		host: "gitlab.example.com",
		token: async () => token,
	};
}

describe("encodeProjectPath", () => {
	it("encodes a flat owner/name", () => {
		expect(encodeProjectPath("acme", "widget")).toBe("acme%2Fwidget");
	});

	it("encodes a subgroup path (a/b/c → a%2Fb%2Fc)", () => {
		expect(encodeProjectPath("a/b", "c")).toBe("a%2Fb%2Fc");
	});
});

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
		}) as unknown as unknown as typeof fetch;
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
		}) as unknown as unknown as typeof fetch;
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

	it("preserves known empty totals", async () => {
		mockFetchWithHeaders(200, [], {
			"x-total": "0",
			"x-total-pages": "0",
			"x-next-page": "",
		});
		const result = await gitlabRestWithMeta(makeDeps(), "/projects");
		expect(result).toMatchObject({
			total: 0,
			totalPages: 0,
			nextPage: null,
			nextPageKnown: true,
		});
	});

	it("does not invent totals from malformed or negative headers", async () => {
		mockFetchWithHeaders(200, [], {
			"x-total": "4junk",
			"x-total-pages": "-2",
		});
		const result = await gitlabRestWithMeta(makeDeps(), "/projects");
		expect(result.total).toBeNull();
		expect(result.totalPages).toBeNull();
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

describe("GitLab writes, pagination and forks", () => {
	let originalFetch: typeof globalThis.fetch;
	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function respond(
		body: unknown,
		headers: Record<string, string> = {},
		status = 200,
	) {
		return new Response(JSON.stringify(body), { status, headers });
	}

	it.each([
		"POST",
		"PUT",
	] as const)("sends a JSON %s to the configured HTTPS port", async (method) => {
		let captured: RequestInit | undefined;
		let capturedUrl = "";
		globalThis.fetch = mock(async (url, init) => {
			capturedUrl = String(url);
			captured = init;
			return respond({ iid: 2 });
		}) as unknown as typeof fetch;
		const body = { title: "MR", squash: false };
		expect(
			await gitlabRestPost<{ iid: number }>(
				{ ...makeDeps(), host: "gl.example:8443" },
				"/projects/a%2Fb/merge_requests",
				body,
				method,
			),
		).toEqual({ iid: 2 });
		expect(capturedUrl).toBe(
			"https://gl.example:8443/api/v4/projects/a%2Fb/merge_requests",
		);
		expect(captured).toMatchObject({
			method,
			body: JSON.stringify(body),
			headers: {
				Authorization: "Bearer tok-123",
				"Content-Type": "application/json",
			},
		});
	});

	it("rejects a write with no token before sending it", async () => {
		const request = mock(async () => respond({}));
		globalThis.fetch = request as unknown as typeof fetch;
		await expect(
			gitlabRestPost(makeDeps(null), "/projects/1", {}),
		).rejects.toMatchObject({ status: 401 });
		expect(request).not.toHaveBeenCalled();
	});

	it("follows explicit next pages even when a page is shorter than 100", async () => {
		const pages: string[] = [];
		globalThis.fetch = mock(async (url) => {
			const page = new URL(String(url)).searchParams.get("page") ?? "";
			pages.push(page);
			return page === "1"
				? respond([1], { "x-next-page": "3" })
				: respond([3], { "x-next-page": "" });
		}) as unknown as typeof fetch;
		expect(
			await gitlabRestAll(makeDeps(), "/projects", { archived: false }),
		).toEqual([1, 3]);
		expect(pages).toEqual(["1", "3"]);
	});

	it("continues full pages when pagination headers are absent", async () => {
		let calls = 0;
		globalThis.fetch = mock(async () =>
			respond(++calls === 1 ? Array.from({ length: 100 }, (_, i) => i) : [100]),
		) as unknown as typeof fetch;
		expect(await gitlabRestAll(makeDeps(), "/projects")).toHaveLength(101);
		expect(calls).toBe(2);
	});

	it.each([
		"1",
		"0",
		"-1",
		"2junk",
		"1.5",
		"9007199254740992",
	])("rejects a non-advancing or invalid next page %s", async (next) => {
		globalThis.fetch = mock(async () =>
			respond([1], { "x-next-page": next }),
		) as unknown as typeof fetch;
		await expect(gitlabRestAll(makeDeps(), "/projects")).rejects.toMatchObject({
			status: 502,
		});
	});

	it("rejects a list response with the wrong shape", async () => {
		globalThis.fetch = mock(async () =>
			respond({ message: "not a list" }),
		) as unknown as typeof fetch;
		await expect(gitlabRestAll(makeDeps(), "/projects")).rejects.toMatchObject({
			status: 502,
		});
	});

	it("resolves nested fork source namespaces", async () => {
		globalThis.fetch = mock(async () =>
			respond({ path_with_namespace: "team/subgroup/widget" }),
		) as unknown as typeof fetch;
		expect(await resolveForkSourceProject(makeDeps(), 42)).toEqual({
			owner: "team/subgroup",
			name: "widget",
		});
	});

	it("treats a deleted or inaccessible fork source as unknown", async () => {
		globalThis.fetch = mock(async () =>
			respond({}, {}, 404),
		) as unknown as typeof fetch;
		expect(await resolveForkSourceProject(makeDeps(), 42)).toBeNull();
	});

	it("preserves authentication failure while resolving a fork source", async () => {
		globalThis.fetch = mock(async () =>
			respond({}, {}, 401),
		) as unknown as typeof fetch;
		await expect(
			resolveForkSourceProject(makeDeps(), 42),
		).rejects.toMatchObject({ status: 401 });
	});

	it("does not fetch when a source project is absent", async () => {
		const request = mock(async () => respond({}));
		globalThis.fetch = request as unknown as typeof fetch;
		expect(await resolveForkSourceProject(makeDeps(), undefined)).toBeNull();
		expect(request).not.toHaveBeenCalled();
	});
});

test("native request deadline includes credential retrieval and response body", async () => {
	const original = globalThis.fetch;
	try {
		const abort = new AbortController();
		const pending = gitlabRest(
			{
				host: "gitlab.example.com",
				token: () => new Promise(() => {}),
				signal: abort.signal,
			},
			"/projects/1",
		);
		abort.abort(new Error("fixture deadline"));
		await expect(pending).rejects.toThrow("fixture deadline");
		const bodyAbort = new AbortController();
		globalThis.fetch = mock(
			async () => new Response(new ReadableStream({ start() {} })),
		) as unknown as typeof fetch;
		const reading = gitlabRest(
			{ ...makeDeps(), signal: bodyAbort.signal },
			"/projects/1",
		);
		await Promise.resolve();
		bodyAbort.abort(new Error("fixture body deadline"));
		await expect(reading).rejects.toThrow("fixture body deadline");
	} finally {
		globalThis.fetch = original;
	}
});
