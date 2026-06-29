import { describe, expect, test } from "bun:test";
import type { ChangedFile } from "shared/changes-types";
import { sortFilesGroupedOrder, sortFilesTreeOrder } from "./sortFiles";

function makeFile(path: string): ChangedFile {
	return { path, status: "modified", additions: 0, deletions: 0 };
}

/**
 * Generate `count` changed files that all live at the same nesting `depth`.
 * Used to probe how sorting scales with path depth — the cost of building the
 * intermediate tree should grow linearly with depth, not quadratically.
 */
function makeFilesAtDepth(count: number, depth: number): ChangedFile[] {
	const files: ChangedFile[] = [];
	for (let i = 0; i < count; i++) {
		const parts: string[] = [];
		for (let d = 0; d < depth - 1; d++) {
			parts.push(`dir${d}`);
		}
		parts.push(`file_${i}.ts`);
		files.push(makeFile(parts.join("/")));
	}
	return files;
}

function timeOnce(fn: () => void): number {
	const start = performance.now();
	fn();
	return performance.now() - start;
}

describe("sortFilesTreeOrder", () => {
	test("orders folders before files and alphabetically within a level", () => {
		const sorted = sortFilesTreeOrder([
			makeFile("zeta.ts"),
			makeFile("alpha.ts"),
			makeFile("src/main.ts"),
		]);

		expect(sorted.map((f) => f.path)).toEqual([
			// folder contents come before top-level files
			"src/main.ts",
			"alpha.ts",
			"zeta.ts",
		]);
	});

	test("keeps nested folders grouped depth-first", () => {
		const sorted = sortFilesTreeOrder([
			makeFile("src/utils/b.ts"),
			makeFile("src/a.ts"),
			makeFile("src/utils/a.ts"),
			makeFile("README.md"),
		]);

		expect(sorted.map((f) => f.path)).toEqual([
			"src/utils/a.ts",
			"src/utils/b.ts",
			"src/a.ts",
			"README.md",
		]);
	});

	test("returns every input file exactly once for a large changeset", () => {
		const files = makeFilesAtDepth(16560, 12);
		const sorted = sortFilesTreeOrder(files);

		expect(sorted).toHaveLength(files.length);
		expect(new Set(sorted.map((f) => f.path)).size).toBe(files.length);
	});

	// Reproduces #5356: sorting a large changeset was slow because the tree
	// builder reconstructed each node's full path with
	// `parts.slice(0, i + 1).join("/")` at every level — O(depth^2) string work
	// per file. Quadratic-in-depth work makes the cost blow up far faster than
	// the path depth grows. With the fix the path is accumulated incrementally,
	// so quadrupling the depth should only quadruple the work (linear), never
	// ~16x it (quadratic).
	test("scales roughly linearly with path depth (no quadratic path rebuild)", () => {
		const COUNT = 3000;
		const shallow = makeFilesAtDepth(COUNT, 50);
		const deep = makeFilesAtDepth(COUNT, 200); // 4x the depth, same file count

		// Warm up the JIT so the measured runs are representative.
		sortFilesTreeOrder(shallow);
		sortFilesTreeOrder(deep);

		const shallowMs = timeOnce(() => sortFilesTreeOrder(shallow));
		const deepMs = timeOnce(() => sortFilesTreeOrder(deep));

		// Linear scaling => ~4x. Quadratic scaling => ~16x. A threshold of 8
		// sits comfortably between the two regimes and is machine-independent
		// because it compares the function against itself.
		expect(deepMs / shallowMs).toBeLessThan(8);
	});
});

describe("sortFilesGroupedOrder", () => {
	test("groups files by folder, folders sorted alphabetically", () => {
		const sorted = sortFilesGroupedOrder([
			makeFile("src/b.ts"),
			makeFile("docs/intro.md"),
			makeFile("src/a.ts"),
		]);

		expect(sorted.map((f) => f.path)).toEqual([
			"docs/intro.md",
			"src/a.ts",
			"src/b.ts",
		]);
	});
});
