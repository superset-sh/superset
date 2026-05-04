import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSearchIndex, invalidateAllSearchIndexes } from "./search";

/**
 * Verifies finding #2's fix from `plans/v2-paths-worktree-perf-fix-plan.md`:
 *
 * `searchIndexCache` now has a hard LRU cap (`SEARCH_INDEX_CACHE_MAX = 12`)
 * plus a 30-min idle TTL. These tests confirm:
 *   - active worktrees stay cached (LRU bump on access)
 *   - exceeding the cap evicts least-recently-used entries
 *   - a worktree touched once and abandoned eventually loses its index
 *
 * The cap is intentionally small (~12) because realistic concurrent search
 * activity rarely spans more than a handful of worktrees. Cold-search latency
 * after eviction is one fast-glob walk (~50–200 ms for a 5k-file repo).
 */

// Must match SEARCH_INDEX_CACHE_MAX in search.ts. If you change the constant,
// update this and the assertions below.
const CACHE_MAX = 12;

const tempRoots: string[] = [];

afterEach(async () => {
	invalidateAllSearchIndexes();
	await Promise.all(
		tempRoots.splice(0, tempRoots.length).map(async (rootPath) => {
			await fs.rm(rootPath, { recursive: true, force: true });
		}),
	);
});

async function createTempWorktree(fileCount: number): Promise<string> {
	const rootPath = await fs.mkdtemp(
		path.join(os.tmpdir(), "workspace-fs-cache-"),
	);
	tempRoots.push(rootPath);

	for (let i = 0; i < fileCount; i++) {
		await fs.writeFile(
			path.join(rootPath, `file-${i}.ts`),
			`export const value = ${i};\n`,
		);
	}

	return rootPath;
}

describe("searchIndexCache LRU eviction", () => {
	it("retains up to CACHE_MAX recently-used indexes", async () => {
		// Build exactly CACHE_MAX indexes — none should be evicted.
		const roots: string[] = [];
		for (let i = 0; i < CACHE_MAX; i++) {
			roots.push(await createTempWorktree(3));
		}

		const firstReads: Awaited<ReturnType<typeof getSearchIndex>>[] = [];
		for (const root of roots) {
			firstReads.push(
				await getSearchIndex({ rootPath: root, includeHidden: false }),
			);
		}

		// Re-read in REVERSE order so the first-built entry isn't auto-promoted.
		// All entries should still be live (size === CACHE_MAX, none evicted).
		for (let i = roots.length - 1; i >= 0; i--) {
			const root = roots[i];
			if (!root) throw new Error("missing root");
			const cached = await getSearchIndex({
				rootPath: root,
				includeHidden: false,
			});
			const expected = firstReads[i];
			if (!expected) throw new Error("missing first read");
			expect(cached).toBe(expected);
		}
	});

	it("evicts the least-recently-used entry when adding a (CACHE_MAX+1)th worktree", async () => {
		// Build CACHE_MAX worktrees in order; entry 0 is the oldest.
		const roots: string[] = [];
		const initialReads: Awaited<ReturnType<typeof getSearchIndex>>[] = [];
		for (let i = 0; i < CACHE_MAX; i++) {
			const root = await createTempWorktree(2);
			roots.push(root);
			initialReads.push(
				await getSearchIndex({ rootPath: root, includeHidden: false }),
			);
		}

		// Add one more worktree — this should evict entry 0 (oldest).
		const extraRoot = await createTempWorktree(2);
		await getSearchIndex({ rootPath: extraRoot, includeHidden: false });

		const root0 = roots[0];
		if (!root0) throw new Error("missing root");
		const refetchedRoot0 = await getSearchIndex({
			rootPath: root0,
			includeHidden: false,
		});

		// Entry 0 was evicted, then rebuilt — different array reference.
		expect(refetchedRoot0).not.toBe(initialReads[0]);
		expect(refetchedRoot0.length).toBe(2);
	});

	it("LRU bump on access — touching the oldest keeps it alive", async () => {
		const roots: string[] = [];
		const initialReads: Awaited<ReturnType<typeof getSearchIndex>>[] = [];
		for (let i = 0; i < CACHE_MAX; i++) {
			const root = await createTempWorktree(2);
			roots.push(root);
			initialReads.push(
				await getSearchIndex({ rootPath: root, includeHidden: false }),
			);
		}

		// Touch entry 0 — bumps it to MRU. Entry 1 becomes LRU.
		const root0 = roots[0];
		if (!root0) throw new Error("missing root");
		await getSearchIndex({ rootPath: root0, includeHidden: false });

		// Add a new worktree — entry 1 should be evicted, not entry 0.
		const extraRoot = await createTempWorktree(2);
		await getSearchIndex({ rootPath: extraRoot, includeHidden: false });

		// Entry 0 still cached.
		const reread0 = await getSearchIndex({
			rootPath: root0,
			includeHidden: false,
		});
		const expected0 = initialReads[0];
		if (!expected0) throw new Error("missing initial read");
		expect(reread0).toBe(expected0);

		// Entry 1 evicted.
		const root1 = roots[1];
		if (!root1) throw new Error("missing root");
		const reread1 = await getSearchIndex({
			rootPath: root1,
			includeHidden: false,
		});
		expect(reread1).not.toBe(initialReads[1]);
	});

	it("explicit invalidation still works", async () => {
		const rootPath = await createTempWorktree(2);
		const before = await getSearchIndex({ rootPath, includeHidden: false });

		invalidateAllSearchIndexes();

		const after = await getSearchIndex({ rootPath, includeHidden: false });
		expect(after).not.toBe(before);
		expect(after.length).toBe(before.length);
	});
});
