import { afterEach, describe, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSearchIndex, invalidateAllSearchIndexes } from "./search";
import { FsWatcherManager } from "./watch";

/**
 * BENCHMARK companions to the integration tests for findings #2 and #3.
 *
 * Quotes real heap deltas (via `Bun.gc(true)` + `process.memoryUsage`) so
 * memory creep claims are anchored to measured RSS-adjacent numbers, not
 * just structural arguments ("entries persist forever, therefore memory
 * grows"). Output goes through `console.log`; assertions are minimal so
 * the benchmark doesn't fail on noisy machines.
 *
 * Caveat: these measure JS heap, not RSS. Native FSEvents/parcel allocations
 * outside the JS heap don't show up here. For RSS you'd want `process.rss`
 * at the OS level, which is noisy and often dominated by other allocations.
 */

interface HeapSample {
	heapMb: number;
}

async function gcAndSample(): Promise<HeapSample> {
	// Multiple GC passes with microtask yields between — single Bun.gc(true)
	// can leave incremental work pending; double-pumping gets us a stable
	// reading for benchmark output.
	if (typeof Bun !== "undefined" && typeof Bun.gc === "function") {
		Bun.gc(true);
		await new Promise((resolve) => setTimeout(resolve, 20));
		Bun.gc(true);
	}
	const used = process.memoryUsage().heapUsed;
	return { heapMb: +(used / 1024 / 1024).toFixed(2) };
}

const tempRoots: string[] = [];

afterEach(async () => {
	invalidateAllSearchIndexes();
	await Promise.all(
		tempRoots.splice(0).map(async (rootPath) => {
			await fs.rm(rootPath, { recursive: true, force: true });
		}),
	);
});

async function createWorktreeWith(
	fileCount: number,
	prefix = "bench-cache-",
): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	const rootPath = await fs.realpath(tempPath);
	tempRoots.push(rootPath);

	for (let i = 0; i < fileCount; i++) {
		await fs.writeFile(
			path.join(rootPath, `file-${i}.ts`),
			`export const value${i} = ${i};\n// padding to make a realistic file size\nconst _x${i} = "abcdef";\n`,
		);
	}

	return rootPath;
}

describe("BENCH: searchIndexCache heap delta vs N worktrees", () => {
	test("prints heap MB after building 5/25/100 worktree indexes", async () => {
		const stages = [
			{ count: 5, filesPerWorktree: 200 },
			{ count: 25, filesPerWorktree: 200 },
			{ count: 100, filesPerWorktree: 200 },
		];

		console.log("\n=== searchIndexCache heap benchmark ===");
		console.log("worktrees\tfiles/wt\theap MB\tdelta MB\ttotal entries");

		const baseline = await gcAndSample();
		console.log(`baseline\t-\t\t${baseline.heapMb}\t-\t\t-`);

		let cumulativeWorktrees = 0;
		let cumulativeEntries = 0;
		let prevHeap = baseline.heapMb;

		for (const stage of stages) {
			for (let i = 0; i < stage.count; i++) {
				const root = await createWorktreeWith(
					stage.filesPerWorktree,
					`bench-cache-${cumulativeWorktrees + i}-`,
				);
				const index = await getSearchIndex({
					rootPath: root,
					includeHidden: false,
				});
				cumulativeEntries += index.length;
			}
			cumulativeWorktrees += stage.count;

			const sample = await gcAndSample();
			console.log(
				`${cumulativeWorktrees}\t\t${stage.filesPerWorktree}\t\t${sample.heapMb}\t+${(sample.heapMb - prevHeap).toFixed(2)}\t\t${cumulativeEntries}`,
			);
			prevHeap = sample.heapMb;
		}

		const final = await gcAndSample();
		console.log(
			`\nTotal heap delta: +${(final.heapMb - baseline.heapMb).toFixed(2)} MB for ${cumulativeWorktrees} cached worktree indexes (${cumulativeEntries} entries)`,
		);
		console.log(
			`Per-worktree: ~${((final.heapMb - baseline.heapMb) / cumulativeWorktrees).toFixed(3)} MB`,
		);
		console.log(
			`Per-entry: ~${(((final.heapMb - baseline.heapMb) * 1024) / cumulativeEntries).toFixed(2)} KB`,
		);

		// Confirm cache holds: invalidating frees memory.
		invalidateAllSearchIndexes();
		const afterInvalidate = await gcAndSample();
		console.log(
			`After invalidateAllSearchIndexes: ${afterInvalidate.heapMb} MB (freed ${(final.heapMb - afterInvalidate.heapMb).toFixed(2)} MB)`,
		);
		console.log("===\n");
	}, 60_000);
});

describe("BENCH: pathTypes heap delta vs unique paths", () => {
	test("prints heap MB after creating 1k/5k/20k unique paths in one worktree", async () => {
		const tempPath = await fs.mkdtemp(
			path.join(os.tmpdir(), "bench-pathtypes-"),
		);
		const rootPath = await fs.realpath(tempPath);
		tempRoots.push(rootPath);

		const manager = new FsWatcherManager({ debounceMs: 50 });
		let createCount = 0;
		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath, recursive: true },
			(batch) => {
				for (const event of batch.events) {
					if (event.kind === "create") createCount++;
				}
			},
		);

		interface ManagerInternal {
			watchers: Map<
				string,
				{
					filePaths: Map<string, true>;
					directoryPaths: Set<string>;
				}
			>;
		}
		const getPathTypesSize = (): number => {
			const internal = manager as unknown as ManagerInternal;
			const state = internal.watchers.get(rootPath);
			if (!state) return 0;
			return state.filePaths.size + state.directoryPaths.size;
		};

		const stages = [1_000, 5_000, 20_000];

		console.log("\n=== pathTypes heap benchmark ===");
		console.log(
			"unique paths\tcreate events\tpathTypes size\theap MB\tdelta MB",
		);

		const baseline = await gcAndSample();
		console.log(`baseline\t-\t\t-\t\t${baseline.heapMb}\t-`);

		let prevHeap = baseline.heapMb;
		let totalCreated = 0;

		for (const target of stages) {
			const toCreate = target - totalCreated;
			for (let i = 0; i < toCreate; i++) {
				await fs.writeFile(
					path.join(rootPath, `unique-${totalCreated + i}.tmp`),
					`${totalCreated + i}`,
				);
			}
			totalCreated = target;

			// Wait for parcel watcher to catch up. We don't need every event
			// to flush — we just want pathTypes to reflect the bulk. Once
			// past the 10k file cap the size plateaus, so we cap the
			// predicate target to avoid spinning the deadline.
			const FILE_PATHS_MAX = 10_000;
			const expectedSize = Math.min(target, FILE_PATHS_MAX);
			const deadline = Date.now() + 30_000;
			while (
				getPathTypesSize() < expectedSize * 0.95 &&
				Date.now() < deadline
			) {
				await new Promise((resolve) => setTimeout(resolve, 200));
			}

			const sample = await gcAndSample();
			console.log(
				`${target}\t\t${createCount}\t\t${getPathTypesSize()}\t\t${sample.heapMb}\t+${(sample.heapMb - prevHeap).toFixed(2)}`,
			);
			prevHeap = sample.heapMb;
		}

		const final = await gcAndSample();
		console.log(
			`\nTotal heap delta: +${(final.heapMb - baseline.heapMb).toFixed(2)} MB for ${getPathTypesSize()} pathTypes entries`,
		);
		console.log(
			`Per 10k paths: ~${(((final.heapMb - baseline.heapMb) * 10_000) / Math.max(getPathTypesSize(), 1)).toFixed(2)} MB`,
		);
		console.log("===\n");

		await unsubscribe();
		await manager.close();
	}, 120_000);
});
