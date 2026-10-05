import { afterEach, expect, spyOn, test } from "bun:test";
import { fetchStarHistory } from "./star-history";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

function metadata(stars: number) {
	return Response.json({
		stargazers_count: stars,
		created_at: "2026-09-01T00:00:00Z",
	});
}

test("the whole walk stops at its deadline, without starting later pages or retries", async () => {
	let pageCalls = 0;
	spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
		if (!String(url).includes("/stargazers?")) return metadata(1000);
		pageCalls++;
		return new Promise<Response>((_resolve, reject) => {
			const signal = init?.signal;
			if (signal?.aborted) return reject(signal.reason);
			signal?.addEventListener("abort", () => reject(signal.reason), {
				once: true,
			});
		});
	});
	const start = performance.now();
	const data = await fetchStarHistory({
		token: "test",
		timeoutMs: 15_000,
		totalTimeoutMs: 50,
	});
	expect(data).toEqual({ points: [], totalStars: 1000 });
	expect(pageCalls).toBe(4);
	expect(performance.now() - start).toBeLessThan(1000);
});

test("one missing page cannot become a fake final-day spike", async () => {
	spyOn(globalThis, "fetch").mockImplementation(async (url) => {
		if (!String(url).includes("/stargazers?")) return metadata(1100);
		if (new URL(String(url)).searchParams.get("page") === "2")
			return new Response(null, { status: 503 });
		return Response.json(
			Array.from({ length: 100 }, () => ({
				starred_at: "2026-09-02T00:00:00Z",
			})),
		);
	});
	expect(await fetchStarHistory({ token: "test" })).toEqual({
		points: [],
		totalStars: 1100,
	});
});

test("complete pages retain real daily star counts", async () => {
	spyOn(globalThis, "fetch").mockImplementation(async (url) => {
		if (!String(url).includes("/stargazers?")) return metadata(2);
		return Response.json([
			{ starred_at: "2026-09-02T10:00:00Z" },
			{ starred_at: "2026-09-03T10:00:00Z" },
		]);
	});
	const data = await fetchStarHistory({ token: "test" });
	expect(data?.points.slice(0, 3)).toEqual([
		{ date: "2026-09-01", stars: 0 },
		{ date: "2026-09-02", stars: 1 },
		{ date: "2026-09-03", stars: 2 },
	]);
});

test("a newer live total does not fabricate stars on the last day", async () => {
	spyOn(globalThis, "fetch").mockImplementation(async (url) => {
		if (!String(url).includes("/stargazers?")) return metadata(3);
		return Response.json([
			{ starred_at: "2026-09-02T10:00:00Z" },
			{ starred_at: "2026-09-03T10:00:00Z" },
		]);
	});
	const data = await fetchStarHistory({ token: "test" });
	expect(data?.totalStars).toBe(3);
	expect(data?.points.at(-1)?.stars).toBe(2);
});
