import { beforeEach, describe, expect, it, mock } from "bun:test";

const registered: string[] = [];
const released: string[] = [];
let nextToken = 0;

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		pageContent: {
			register: {
				mutate: async ({ html }: { html: string }) => {
					const token = `token-${++nextToken}`;
					registered.push(token);
					return { token, url: `superset-page://${token}/?${html.length}` };
				},
			},
			release: {
				mutate: async ({ token }: { token: string }) => {
					released.push(token);
				},
			},
		},
	},
}));

const {
	clearThumbnailCache,
	getCachedThumbnailUrl,
	loadThumbnailUrl,
	ThumbnailCacheClearedError,
	thumbnailCacheKey,
} = await import("./pageThumbnailCache");

function deferred() {
	let resolve!: (value: string) => void;
	const promise = new Promise<string>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

beforeEach(() => {
	clearThumbnailCache();
	registered.length = 0;
	released.length = 0;
});

describe("thumbnailCacheKey", () => {
	it("keys by page and version so a republish misses the cache", () => {
		expect(thumbnailCacheKey("page-1", 2)).not.toBe(
			thumbnailCacheKey("page-1", 3),
		);
	});
});

describe("loadThumbnailUrl", () => {
	it("registers once and serves later reads from cache", async () => {
		const url = await loadThumbnailUrl("a:1", async () => "<html>a</html>");
		expect(registered).toHaveLength(1);
		expect(getCachedThumbnailUrl("a:1")).toBe(url);

		const second = await loadThumbnailUrl("a:1", async () => "<html>a</html>");
		expect(second).toBe(url);
		expect(registered).toHaveLength(1);
	});

	it("dedupes concurrent loads of the same key into one registration", async () => {
		const gate = deferred();
		const first = loadThumbnailUrl("b:1", () => gate.promise);
		const second = loadThumbnailUrl("b:1", () => gate.promise);
		gate.resolve("<html>b</html>");

		expect(await first).toBe(await second);
		expect(registered).toHaveLength(1);
	});
});

describe("clearThumbnailCache", () => {
	it("releases every token it evicts", async () => {
		await loadThumbnailUrl("c:1", async () => "<html>c</html>");
		await loadThumbnailUrl("d:1", async () => "<html>d</html>");
		const issued = [...registered];

		clearThumbnailCache();

		expect(released.sort()).toEqual(issued.sort());
		expect(getCachedThumbnailUrl("c:1")).toBeUndefined();
		expect(getCachedThumbnailUrl("d:1")).toBeUndefined();
	});

	it("does not let a load pending across the clear repopulate the cache", async () => {
		const gate = deferred();
		const pending = loadThumbnailUrl("e:1", () => gate.promise);

		clearThumbnailCache();
		gate.resolve("<html>e</html>");

		await expect(pending).rejects.toBeInstanceOf(ThumbnailCacheClearedError);
		expect(getCachedThumbnailUrl("e:1")).toBeUndefined();
	});

	it("releases the token of a registration that lands after the clear", async () => {
		const gate = deferred();
		const pending = loadThumbnailUrl("f:1", () => gate.promise);

		clearThumbnailCache();
		gate.resolve("<html>f</html>");
		await pending.catch(() => {});

		expect(registered).toHaveLength(1);
		expect(released).toEqual(registered);
	});

	it("lets a fresh load for the same key succeed after the clear", async () => {
		const gate = deferred();
		const stale = loadThumbnailUrl("g:1", () => gate.promise);
		clearThumbnailCache();
		gate.resolve("<html>stale</html>");
		await stale.catch(() => {});

		const url = await loadThumbnailUrl("g:1", async () => "<html>fresh</html>");
		expect(getCachedThumbnailUrl("g:1")).toBe(url);
		expect(released).not.toContain(tokenFor(url));
	});
});

function tokenFor(url: string): string {
	return url.replace("superset-page://", "").split("/")[0] ?? "";
}
