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

function snapshot(
	unstaged: ChangedFile[] = [],
	tag = "",
): GitStatusSnapshot & { tag?: string } {
	return {
		currentBranch: BRANCH,
		defaultBranch: BRANCH,
		againstBase: [],
		staged: [],
		unstaged,
		ignoredPaths: [],
		...(tag ? { tag } : {}),
	};
}

function gate() {
	let release!: () => void;
	let started!: () => void;
	const opened = new Promise<void>((r) => {
		release = r;
	});
	const running = new Promise<void>((r) => {
		started = r;
	});
	return { release, started, opened, running };
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

/** Peek at the private state so growth can be measured rather than guessed. */
function variantsOf(store: GitStatusStore, workspaceId: string) {
	const map = (
		store as unknown as {
			workspaces: Map<
				string,
				Map<string, { cached: unknown; pending: Set<string> | null }>
			>;
		}
	).workspaces.get(workspaceId);
	if (!map) throw new Error("workspace not attached");
	return map;
}

describe("GitStatusStore interleavings", () => {
	test("concurrent first reads on two variants, a scoped change between them: one full walk each, then one partial each", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({
			full: () => snapshot([file("a.ts")]),
			partial: (paths) => ({ paths, unstaged: [file("b.ts")] }),
		});
		const g = gate();
		const computeFull = async () => {
			g.started();
			await g.opened;
			return h.computeFull();
		};

		const sidebar = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial: h.computePartial,
		});
		const changes = store.read({
			workspaceId: "w",
			baseBranch: "main",
			computeFull,
			computePartial: h.computePartial,
		});
		await g.running;
		store.recordChange("w", ["b.ts"]);
		g.release();
		await Promise.all([sidebar, changes]);
		expect(h.calls.full).toBe(2);

		const again = await Promise.all([
			store.read({ workspaceId: "w", baseBranch: null, ...h }),
			store.read({ workspaceId: "w", baseBranch: "main", ...h }),
		]);
		expect(h.calls.full).toBe(2);
		expect(h.calls.partial).toBe(2);
		expect(h.seen).toEqual([["b.ts"], ["b.ts"]]);
		for (const result of again) {
			expect(result.unstaged.map((f) => f.path).sort()).toEqual([
				"a.ts",
				"b.ts",
			]);
		}
	});

	test("drop while a full walk and a partial are both in flight, then attach: nothing is resurrected", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({
			full: () => snapshot([file("a.ts")]),
			partial: (paths) => ({ paths, unstaged: [file("b.ts")] }),
		});
		// Variant null: cached, then a partial in flight.
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["b.ts"]);
		const pg = gate();
		const partialRead = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull: h.computeFull,
			computePartial: async (paths) => {
				pg.started();
				await pg.opened;
				return h.computePartial(paths);
			},
		});
		// Variant main: a full walk in flight.
		const fg = gate();
		const fullRead = store.read({
			workspaceId: "w",
			baseBranch: "main",
			computeFull: async () => {
				fg.started();
				await fg.opened;
				return h.computeFull();
			},
			computePartial: h.computePartial,
		});
		await Promise.all([pg.running, fg.running]);

		store.drop("w");
		store.attach("w");
		pg.release();
		fg.release();
		const [patched, walked] = await Promise.all([partialRead, fullRead]);
		expect(patched.unstaged.map((f) => f.path).sort()).toEqual([
			"a.ts",
			"b.ts",
		]);
		expect(walked.unstaged.map((f) => f.path)).toEqual(["a.ts"]);
		const fullBefore = h.calls.full;

		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		await store.read({ workspaceId: "w", baseBranch: "main", ...h });
		expect(h.calls.full).toBe(fullBefore + 2);
		expect(variantsOf(store, "w").size).toBe(2);
	});

	test("attach twice keeps the cache; drop of an unknown id and recordChange before any read are no-ops", async () => {
		const store = new GitStatusStore();
		store.drop("never-attached");
		store.recordChange("never-attached", ["a.ts"]);
		store.attach("w");
		store.recordChange("w", ["a.ts"]); // no variants yet: dropped on the floor
		const h = harness();
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.attach("w");
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		expect(h.calls.full).toBe(1);
		expect(h.calls.partial).toBe(0);
	});

	test("recordChange([]) never narrows a broad pending, in either order", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness();
		await store.read({ workspaceId: "w", baseBranch: null, ...h });

		store.recordChange("w", undefined);
		store.recordChange("w", []);
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		expect(h.calls.full).toBe(2);

		store.recordChange("w", []);
		store.recordChange("w", undefined);
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		expect(h.calls.full).toBe(3);
		expect(h.calls.partial).toBe(0);
	});

	test("a read queued behind a slow full walk is served from that walk, not a second one", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({ full: () => snapshot([file("a.ts")]) });
		const g = gate();
		const computeFull = async () => {
			g.started();
			await g.opened;
			return h.computeFull();
		};
		const first = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial: h.computePartial,
		});
		await g.running;
		const second = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial: h.computePartial,
		});
		g.release();
		const [a, b] = await Promise.all([first, second]);
		expect(a).toBe(b);
		expect(h.calls.full).toBe(1);
		expect(h.calls.partial).toBe(0);
	});

	test("a read queued behind a slow full walk re-walks when a broad change landed during the walk", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		let n = 0;
		const h = harness({ full: () => snapshot([file(`walk-${++n}.ts`)]) });
		const g = gate();
		const computeFull = async () => {
			g.started();
			await g.opened;
			return h.computeFull();
		};
		const first = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial: h.computePartial,
		});
		await g.running;
		const second = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull: h.computeFull,
			computePartial: h.computePartial,
		});
		store.recordChange("w", undefined);
		g.release();
		const [a, b] = await Promise.all([first, second]);
		expect(a.unstaged[0]?.path).toBe("walk-1.ts");
		expect(b.unstaged[0]?.path).toBe("walk-2.ts");
		expect(h.calls.full).toBe(2);
		// And the second walk is now the cache.
		const third = await store.read({
			workspaceId: "w",
			baseBranch: null,
			...h,
		});
		expect(third.unstaged[0]?.path).toBe("walk-2.ts");
		expect(h.calls.full).toBe(2);
	});

	test("a partial whose result is cached after a broad change landed mid-partial is not served again", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({
			full: () => snapshot([file("a.ts")]),
			partial: (paths) => ({ paths, unstaged: [file("b.ts")] }),
		});
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["b.ts"]);
		const patched = await store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull: h.computeFull,
			computePartial: async (paths) => {
				store.recordChange("w", undefined);
				return h.computePartial(paths);
			},
		});
		expect(patched.unstaged.map((f) => f.path).sort()).toEqual([
			"a.ts",
			"b.ts",
		]);
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		expect(h.calls.full).toBe(2);
	});
});

describe("GitStatusStore failure paths", () => {
	test("computeFull rejects while another read is queued: the queued read walks again and succeeds", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		let calls = 0;
		const g = gate();
		const computeFull = async () => {
			calls++;
			if (calls === 1) {
				g.started();
				await g.opened;
				throw new Error("walk 1 died");
			}
			return snapshot([file("ok.ts")]);
		};
		const computePartial = async (paths: string[]) => ({
			paths,
			unstaged: [],
		});
		const first = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial,
		});
		await g.running;
		const second = store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial,
		});
		g.release();
		await expect(first).rejects.toThrow("walk 1 died");
		expect((await second).unstaged.map((f) => f.path)).toEqual(["ok.ts"]);
		expect(calls).toBe(2);
		// Cached now.
		await store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial,
		});
		expect(calls).toBe(2);
	});

	test("a partial failure does not evict the cache, and the retry patches onto it", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({
			full: () => snapshot([file("a.ts")]),
			partial: (paths) => ({ paths, unstaged: [file("b.ts")] }),
		});
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["b.ts"]);
		await expect(
			store.read({
				workspaceId: "w",
				baseBranch: null,
				computeFull: h.computeFull,
				computePartial: async () => {
					throw new Error("boom");
				},
			}),
		).rejects.toThrow("boom");
		const result = await store.read({
			workspaceId: "w",
			baseBranch: null,
			...h,
		});
		expect(h.calls.full).toBe(1);
		expect(h.seen).toEqual([["b.ts"]]);
		expect(result.unstaged.map((f) => f.path).sort()).toEqual(["a.ts", "b.ts"]);
	});

	test("a partial that keeps failing is retried on every read until a broad change rescues it (poison path)", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({ full: () => snapshot([file("a.ts")]) });
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["../outside"]);
		const poisoned = {
			workspaceId: "w",
			baseBranch: null,
			computeFull: h.computeFull,
			computePartial: async () => {
				h.calls.partial++;
				throw new Error("fatal: outside repository");
			},
		};
		for (let i = 0; i < 5; i++) {
			await expect(store.read(poisoned)).rejects.toThrow("outside repository");
		}
		expect(h.calls.partial).toBe(5);
		expect(h.calls.full).toBe(1);
		// Only a broad change clears it.
		store.recordChange("w", undefined);
		await store.read(poisoned);
		expect(h.calls.full).toBe(2);
	});

	test("a partial that records the same paths again re-reads them on the next read only once", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness();
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["a.ts"]);
		let reentered = 0;
		const computePartial = async (paths: string[]) => {
			if (reentered++ === 0) store.recordChange("w", paths);
			return h.computePartial(paths);
		};
		await store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull: h.computeFull,
			computePartial,
		});
		await store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull: h.computeFull,
			computePartial,
		});
		await store.read({
			workspaceId: "w",
			baseBranch: null,
			computeFull: h.computeFull,
			computePartial,
		});
		expect(h.seen).toEqual([["a.ts"], ["a.ts"]]);
	});

	test("a partial answering with an empty scope discards its own entries", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({
			full: () => snapshot([file("a.ts")]),
			partial: () => ({ paths: [], unstaged: [file("ghost.ts")] }),
		});
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["ghost.ts"]);
		const result = await store.read({
			workspaceId: "w",
			baseBranch: null,
			...h,
		});
		// applyStatusPartial returns the snapshot untouched when paths is empty.
		expect(result.unstaged.map((f) => f.path)).toEqual(["a.ts"]);
	});

	test("a partial answering with paths outside the request evicts entries it was never asked about", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({
			full: () => snapshot([file("a.ts"), file("c.ts")]),
			partial: () => ({ paths: ["c.ts"], unstaged: [] }),
		});
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		store.recordChange("w", ["b.ts"]);
		const result = await store.read({
			workspaceId: "w",
			baseBranch: null,
			...h,
		});
		expect(result.unstaged.map((f) => f.path)).toEqual(["a.ts"]);
	});
});

describe("GitStatusStore keys and growth", () => {
	test('baseBranch "" and null share one cache slot even though computeFull would differ', async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const seenBases: (string | null)[] = [];
		const read = (baseBranch: string | null) =>
			store.read({
				workspaceId: "w",
				baseBranch,
				computeFull: async () => {
					seenBases.push(baseBranch);
					return snapshot([file(`base-${String(baseBranch)}.ts`)]);
				},
				computePartial: async (paths) => ({ paths, unstaged: [] }),
			});
		const viaNull = await read(null);
		const viaEmpty = await read("");
		expect(seenBases).toEqual([null]);
		// The "" reader gets the null reader's snapshot.
		expect(viaEmpty).toBe(viaNull);
	});

	test("pending grows without bound for a variant nobody reads again", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness();
		await store.read({ workspaceId: "w", baseBranch: null, ...h });
		await store.read({ workspaceId: "w", baseBranch: "main", ...h });

		const batches = 5_000;
		const perBatch = 128;
		const before = process.memoryUsage().heapUsed;
		for (let b = 0; b < batches; b++) {
			const paths = Array.from(
				{ length: perBatch },
				(_, i) => `src/dir-${b}/file-${i}.ts`,
			);
			store.recordChange("w", paths);
			// The sidebar variant is read (and drained) every batch...
			await store.read({ workspaceId: "w", baseBranch: null, ...h });
		}
		const after = process.memoryUsage().heapUsed;
		// ...but the Changes-tab variant was never read again.
		const main = variantsOf(store, "w").get("main");
		const sidebar = variantsOf(store, "w").get("");
		expect(sidebar?.pending?.size).toBe(0);
		expect(main?.pending?.size).toBe(batches * perBatch);
		console.info(
			`[finding] pending Set for the unread variant holds ${main?.pending?.size} paths; heap grew ~${Math.round((after - before) / 1024 / 1024)} MB`,
		);
	});

	test("variants are never evicted: one cached snapshot per distinct baseBranch ever read", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const h = harness({
			full: () =>
				snapshot(Array.from({ length: 2_000 }, (_, i) => file(`f-${i}.ts`))),
		});
		for (let i = 0; i < 300; i++) {
			await store.read({ workspaceId: "w", baseBranch: `branch-${i}`, ...h });
		}
		const variants = variantsOf(store, "w");
		expect(variants.size).toBe(300);
		let cachedEntries = 0;
		for (const v of variants.values()) {
			cachedEntries += (v.cached as GitStatusSnapshot).unstaged.length;
		}
		console.info(
			`[finding] ${variants.size} variants retained, ${cachedEntries} cached ChangedFile entries for one workspace`,
		);
	});
});
