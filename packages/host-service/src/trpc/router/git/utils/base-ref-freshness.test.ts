import { describe, expect, mock, test } from "bun:test";
import { scheduleBaseRefFetch } from "./base-ref-freshness";

// Distinct remote/branch per test so the module-level TTL/in-flight maps
// (keyed by commonDir#remote/branch) don't leak state across tests.
function createGit(options: { fetch?: () => Promise<unknown> } = {}) {
	const fetchCalls: string[][] = [];
	const revParseCalls: string[][] = [];
	const git = {
		raw: mock(async (args: string[]) => {
			revParseCalls.push(args);
			if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
				return ".git\n";
			}
			throw new Error(`Unexpected raw args: ${args.join(" ")}`);
		}),
		fetch: mock(async (args: string[]) => {
			fetchCalls.push(args);
			return options.fetch ? options.fetch() : undefined;
		}),
	} as never as import("simple-git").SimpleGit;
	return { git, fetchCalls, revParseCalls };
}

describe("scheduleBaseRefFetch", () => {
	test("fetches the base branch with the expected args", async () => {
		const { git, fetchCalls } = createGit();
		await scheduleBaseRefFetch(git, "/repo/wt-a", {
			remote: "origin",
			branch: "main",
		});
		expect(fetchCalls).toEqual([["origin", "main", "--quiet", "--no-tags"]]);
	});

	test("dedupes repeat calls within the TTL window", async () => {
		const { git, fetchCalls } = createGit();
		const target = { remote: "origin", branch: "ttl-branch" };
		await scheduleBaseRefFetch(git, "/repo/wt-ttl", target);
		await scheduleBaseRefFetch(git, "/repo/wt-ttl", target);
		await scheduleBaseRefFetch(git, "/repo/wt-ttl", target);
		expect(fetchCalls).toHaveLength(1);
	});

	test("resolves the common dir fresh each call (no path cache)", async () => {
		const { git, revParseCalls } = createGit();
		const target = { remote: "origin", branch: "fresh-branch" };
		await scheduleBaseRefFetch(git, "/repo/wt-fresh", target);
		await scheduleBaseRefFetch(git, "/repo/wt-fresh", target);
		// One rev-parse per call — a cached path→dir mapping would skip the
		// second and risk keying a reused path off a stale repo's common dir.
		const commonDirCalls = revParseCalls.filter(
			(args) => args[1] === "--git-common-dir",
		);
		expect(commonDirCalls).toHaveLength(2);
	});

	test("coalesces concurrent calls into a single in-flight fetch", async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const { git, fetchCalls } = createGit({ fetch: () => gate });
		const target = { remote: "origin", branch: "inflight-branch" };
		const a = scheduleBaseRefFetch(git, "/repo/wt-inflight", target);
		const b = scheduleBaseRefFetch(git, "/repo/wt-inflight", target);
		release();
		await Promise.all([a, b]);
		expect(fetchCalls).toHaveLength(1);
	});

	test("never rejects when the fetch fails", async () => {
		const { git, fetchCalls } = createGit({
			fetch: () => Promise.reject(new Error("offline")),
		});
		const originalWarn = console.warn;
		console.warn = () => {};
		try {
			// Resolves (does not throw) despite the underlying fetch rejecting.
			await scheduleBaseRefFetch(git, "/repo/wt-fail", {
				remote: "origin",
				branch: "fail-branch",
			});
		} finally {
			console.warn = originalWarn;
		}
		expect(fetchCalls).toHaveLength(1);
	});
});
