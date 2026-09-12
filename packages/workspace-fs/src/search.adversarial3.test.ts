import { afterEach, describe, expect, it, spyOn } from "bun:test";
import nodeFs from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fg from "fast-glob";
import {
	applySearchPatchEvents,
	collectSearchIndexEntries,
	getSearchIndex,
	invalidateAllSearchIndexes,
	MAX_DIRECTORY_PATCH_EVENTS,
	MAX_SEARCH_INDEX_ENTRIES,
	patchSearchIndexesForRoot,
	type SearchPatchEvent,
} from "./search";

const roots: string[] = [];

async function makeRepoRoot(files = 0, perDir = 100): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "search-adv3-"));
	roots.push(root);
	await fs.mkdir(path.join(root, ".git"), { recursive: true });
	for (let d = 0; d * perDir < files; d++) {
		const dir = path.join(root, `d${d}`);
		await fs.mkdir(dir, { recursive: true });
		await Promise.all(
			Array.from({ length: Math.min(perDir, files - d * perDir) }, (_, i) =>
				fs.writeFile(path.join(dir, `f${i}.ts`), "x"),
			),
		);
	}
	return root;
}

afterEach(async () => {
	invalidateAllSearchIndexes();
	await Promise.all(
		roots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

function watchRejections() {
	const seen: unknown[] = [];
	const onRejection = (reason: unknown) => {
		seen.push(reason);
	};
	process.on("unhandledRejection", onRejection);
	return {
		seen,
		stop: () => {
			process.off("unhandledRejection", onRejection);
		},
	};
}

type Readdir = typeof nodeFs.readdir;

function wrapReaddir(
	intercept: (directory: string) => "hang" | "pass",
	onCall?: () => void,
): Readdir {
	const real = nodeFs.readdir as unknown as (...args: unknown[]) => void;
	return ((directory: string, ...rest: unknown[]) => {
		onCall?.();
		if (intercept(directory) === "hang") return;
		real(directory, ...rest);
	}) as unknown as Readdir;
}

function productionStream(root: string, readdir: Readdir) {
	const stream = fg.stream("**/*", {
		cwd: root,
		onlyFiles: true,
		unique: true,
		suppressErrors: true,
		fs: { readdir },
	});
	const destroy = () => {
		(stream as unknown as { destroy: () => void }).destroy();
	};
	return { stream, destroy };
}

describe("directory patch events at the cap", () => {
	const root = "/Users/someone/.superset/worktrees/abc/project";

	function syntheticIndex(size: number) {
		return new Map(
			Array.from({ length: size }, (_, i) => {
				const rel = `packages/pkg${i % 400}/src/c${i % 97}/deep/file${i}.tsx`;
				const abs = path.join(root, rel);
				return [
					abs,
					{
						absolutePath: abs,
						relativePath: rel,
						name: `file${i}.tsx`,
						description: path.dirname(rel),
					},
				];
			}),
		);
	}

	function timeDirectoryDeletes(
		size: number,
		events: readonly SearchPatchEvent[],
	): number {
		const itemsByPath = syntheticIndex(size);
		const started = performance.now();
		applySearchPatchEvents(
			{
				itemsByPath,
				rootPath: root,
				includeHidden: false,
				maxEntries: MAX_SEARCH_INDEX_ENTRIES,
			},
			events,
		);
		return performance.now() - started;
	}

	it("a batch of directory events up to the patch limit stays under the debounce window at the cap", () => {
		// Each directory event scans the index; the patch path only accepts a
		// handful per batch before rebuilding instead, so this is the worst
		// case a single batch can cost on the event loop.
		const events: SearchPatchEvent[] = Array.from(
			{ length: MAX_DIRECTORY_PATCH_EVENTS },
			(_, i) => ({
				kind: "delete" as const,
				absolutePath: path.join(root, `scratch/run${i}`),
				isDirectory: true,
			}),
		);
		timeDirectoryDeletes(2_000, events);
		const cappedMs = timeDirectoryDeletes(MAX_SEARCH_INDEX_ENTRIES, events);
		expect(cappedMs).toBeLessThan(250);
	}, 30_000);

	it("a batch with more directory events than the limit rebuilds instead of patching", async () => {
		const repo = await makeRepoRoot(3);
		await getSearchIndex({ rootPath: repo, includeHidden: false });
		// A cached index would not know about a file written after the walk.
		await fs.writeFile(path.join(repo, "d0", "late.ts"), "x");

		patchSearchIndexesForRoot(
			repo,
			Array.from({ length: MAX_DIRECTORY_PATCH_EVENTS + 1 }, (_, i) => ({
				kind: "delete" as const,
				absolutePath: path.join(repo, `gone${i}`),
				isDirectory: true,
			})),
		);

		const index = await getSearchIndex({
			rootPath: repo,
			includeHidden: false,
		});
		expect(index.map((entry) => entry.name)).toContain("late.ts");
	});
});

describe("build cancellation against a real walk", () => {
	it("an abort settles the collect promptly even when the walk is wedged on a readdir that never returns", async () => {
		const root = await makeRepoRoot(300);
		const rejections = watchRejections();
		const { stream, destroy } = productionStream(
			root,
			wrapReaddir((directory) =>
				directory.endsWith(`${path.sep}d1`) ? "hang" : "pass",
			),
		);
		const abort = new AbortController();
		abort.signal.addEventListener("abort", destroy, { once: true });
		const build = collectSearchIndexEntries(stream, root, {
			maxEntries: 10_000,
			signal: abort.signal,
			stop: destroy,
		});
		await new Promise((resolve) => setTimeout(resolve, 200));
		const started = performance.now();
		abort.abort();
		const outcome = await Promise.race([
			build.then(
				() => "resolved" as const,
				() => "rejected" as const,
			),
			new Promise<"hung">((resolve) =>
				setTimeout(() => resolve("hung"), 2_000),
			),
		]);
		abort.signal.removeEventListener("abort", destroy);
		await new Promise((resolve) => setTimeout(resolve, 50));
		rejections.stop();
		// The stream's premature-close error surfaces here; buildSearchIndex maps
		// any rejection while signal.aborted to SearchIndexBuildAborted.
		expect(outcome).toBe("rejected");
		expect(performance.now() - started).toBeLessThan(500);
		expect(rejections.seen).toEqual([]);
	});

	it("truncation tears the walk down: no further readdir after the cap", async () => {
		const root = await makeRepoRoot(3_000);
		let readdirCalls = 0;
		const { stream, destroy } = productionStream(
			root,
			wrapReaddir(
				() => "pass",
				() => {
					readdirCalls++;
				},
			),
		);
		const result = await collectSearchIndexEntries(stream, root, {
			maxEntries: 150,
			stop: destroy,
		});
		const callsAtStop = readdirCalls;
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(result.truncated).toBe(true);
		expect(result.items).toHaveLength(150);
		// 31 directories exist (root + d0..d29); the walk must not finish them.
		expect(callsAtStop).toBeLessThan(31);
		expect(readdirCalls).toBe(callsAtStop);
	});
});

describe("getSearchIndex restart path", () => {
	function countBuilds(spy: { mock: { calls: unknown[][] } }) {
		return spy.mock.calls.filter((call) => String(call[0]).endsWith(".git"))
			.length;
	}

	it("joiners rejoin a single restarted build after an abort instead of fanning out", async () => {
		const root = await makeRepoRoot(8_000, 200);
		const stat = spyOn(fs, "stat");
		const rejections = watchRejections();
		try {
			const callers = [0, 1, 2].map(() =>
				getSearchIndex({ rootPath: root, includeHidden: false }),
			);
			// Invalidate as soon as the build has started, before its walk can
			// finish: the abort lands while the build is parked on the `.git`
			// stat or in the first readdir.
			while (countBuilds(stat) === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
			expect(countBuilds(stat)).toBe(1);
			// Watcher-style invalidation: file event while nothing is cached.
			patchSearchIndexesForRoot(root, [
				{
					kind: "create",
					absolutePath: path.join(root, "d0", "zz.ts"),
					isDirectory: false,
				},
			]);
			const results = await Promise.all(callers);
			await new Promise((resolve) => setTimeout(resolve, 20));
			for (const items of results) expect(items).toHaveLength(8_000);
			// One original build plus exactly one restart shared by all three.
			expect(countBuilds(stat)).toBe(2);
			expect(rejections.seen).toEqual([]);
		} finally {
			rejections.stop();
			stat.mockRestore();
		}
	}, 20_000);

	it("an abort that lands before the walk has started still settles the caller", async () => {
		const root = await makeRepoRoot(400);
		const stat = spyOn(fs, "stat");
		const rejections = watchRejections();
		try {
			const inFlight = getSearchIndex({ rootPath: root, includeHidden: false });
			// Synchronous: the build is parked on the `.git` stat and has not yet
			// attached its abort listener to the signal.
			invalidateAllSearchIndexes();
			const outcome = await Promise.race([
				inFlight.then((items) => items.length),
				new Promise<"hung">((resolve) =>
					setTimeout(() => resolve("hung"), 5_000),
				),
			]);
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(outcome).toBe(400);
			expect(countBuilds(stat)).toBe(2);
			expect(rejections.seen).toEqual([]);
		} finally {
			rejections.stop();
			stat.mockRestore();
		}
	}, 20_000);
});
