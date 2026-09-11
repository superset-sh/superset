import { describe, expect, test } from "bun:test";
import type { Branch, ChangedFile } from "../../types";
import type { GitStatusSnapshot } from "../git-status";
import type { GitStatusPartial } from "../git-status-partial";
import { GitStatusStore } from "./git-status-store";

const BRANCH: Branch = {
	name: "main",
	isHead: true,
	upstream: null,
	aheadCount: 0,
	behindCount: 0,
	lastCommitHash: "abc",
	lastCommitDate: "2026-01-01",
};

function file(path: string, status: ChangedFile["status"] = "modified") {
	return { path, status, additions: 1, deletions: 0 } satisfies ChangedFile;
}

function snapshot(unstaged: ChangedFile[] = []): GitStatusSnapshot {
	return {
		currentBranch: BRANCH,
		defaultBranch: BRANCH,
		againstBase: [],
		staged: [],
		unstaged,
		ignoredPaths: [],
	};
}

function harness(options?: {
	full?: () => GitStatusSnapshot;
	partial?: (paths: string[]) => GitStatusPartial;
}) {
	const calls = { full: 0, partial: 0 };
	const seen: string[][] = [];
	return {
		calls,
		seen,
		computeFull: async () => {
			calls.full++;
			return options?.full?.() ?? snapshot();
		},
		computePartial: async (paths: string[]) => {
			calls.partial++;
			seen.push(paths);
			return options?.partial?.(paths) ?? { paths, unstaged: [] };
		},
	};
}

describe("GitStatusStore", () => {
	test("an unwatched workspace always walks in full and is never cached", async () => {
		const store = new GitStatusStore();
		const h = harness();

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.calls.full).toBe(2);
		expect(h.calls.partial).toBe(0);
	});

	test("the first read of a watched workspace walks in full", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness();

		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.calls.full).toBe(1);
	});

	test("a read with nothing pending reuses the cache without computing", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness({ full: () => snapshot([file("a.ts")]) });

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		const second = await store.read({
			workspaceId: "w",
			baseBranch: null,
			...h,
		});

		expect(h.calls.full).toBe(1);
		expect(h.calls.partial).toBe(0);
		expect(second.unstaged.map((f) => f.path)).toEqual(["a.ts"]);
	});

	test("a scoped change re-reads only its paths", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness({
			full: () => snapshot([file("a.ts")]),
			partial: (paths) => ({ paths, unstaged: [file("b.ts")] }),
		});

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["b.ts"]);
		const patched = await store.read({
			workspaceId: "w",
			baseBranch: null,
			...h,
		});

		expect(h.calls.full).toBe(1);
		expect(h.seen).toEqual([["b.ts"]]);
		expect(patched.unstaged.map((f) => f.path).sort()).toEqual([
			"a.ts",
			"b.ts",
		]);
	});

	test("a broad change forces a full walk", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness();

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", undefined);
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.calls.full).toBe(2);
		expect(h.calls.partial).toBe(0);
	});

	test("a scoped change after a broad one stays broad", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness();

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", undefined);
		store.recordChange("w", ["a.ts"]);
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.calls.full).toBe(2);
		expect(h.calls.partial).toBe(0);
	});

	test("a different base branch cannot reuse the cache", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness();

		await store.read({ workspaceId: "w", baseBranch: "main", ...h });
		store.recordChange("w", ["a.ts"]);
		await store.read({ workspaceId: "w", baseBranch: "develop", ...h });

		expect(h.calls.full).toBe(2);
		expect(h.calls.partial).toBe(0);
	});

	test("changes landing during a partial read are kept for the next one", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness({
			partial: (paths) => ({ paths, unstaged: [] }),
		});

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["a.ts"]);
		const inFlight = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull: h.computeFull,
			computePartial: async (paths) => {
				store.recordChange("w", ["b.ts"]);
				return h.computePartial(paths);
			},
		});
		await inFlight;
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.seen).toEqual([["a.ts"], ["b.ts"]]);
	});

	test("a failed partial read puts its paths back", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness();

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["a.ts"]);
		await expect(
			store.read({
				workspaceId: "w",
				baseBranch: null,
				computeFull: h.computeFull,
				computePartial: async () => {
					throw new Error("git blew up");
				},
			}),
		).rejects.toThrow("git blew up");

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		expect(h.seen).toEqual([["a.ts"]]);
	});

	test("a broad change during a full walk stops it being cached", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness();

		await store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull: async () => {
				store.recordChange("w", undefined);
				return h.computeFull();
			},
			computePartial: h.computePartial,
		});
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.calls.full).toBe(2);
	});

	test("dropping a workspace discards its cache", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness();

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.drop("w");
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.calls.full).toBe(3);
	});

	test("a deletion in the patch escalates to a full walk", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		store.recordChange("w", []);
		const h = harness({
			partial: (paths) => ({ paths, unstaged: [file("a.ts", "deleted")] }),
		});

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["a.ts"]);
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.calls.partial).toBe(1);
		expect(h.calls.full).toBe(2);
	});

	test("recording against an unwatched workspace is ignored", async () => {
		const store = new GitStatusStore();
		const h = harness();

		store.recordChange("w", ["a.ts"]);
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		expect(h.calls.full).toBe(1);
		expect(h.calls.partial).toBe(0);
	});
});
