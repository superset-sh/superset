import { describe, expect, it } from "bun:test";
import type { TreeBookkeeping } from "./treeBookkeeping";
import { purgeDirectory, rekeyDirectory } from "./treeBookkeeping";

function bookkeeping(
	overrides: Partial<Record<keyof TreeBookkeeping, string[]>> = {},
): TreeBookkeeping {
	return {
		knownPaths: new Set(overrides.knownPaths ?? []),
		loadedDirs: new Set(overrides.loadedDirs ?? []),
		unloadedDirCandidates: new Set(overrides.unloadedDirCandidates ?? []),
	};
}

describe("rekeyDirectory", () => {
	it("moves descendants of the renamed directory", () => {
		const state = bookkeeping({
			knownPaths: ["src/", "src/index.ts", "src/deep/", "other.ts"],
			loadedDirs: ["src", "src/deep"],
		});

		rekeyDirectory(state, "src", "lib");

		// The directory's own key moves too: "src/" starts with the "src/" prefix.
		expect([...state.knownPaths].sort()).toEqual([
			"lib/",
			"lib/deep/",
			"lib/index.ts",
			"other.ts",
		]);
		expect([...state.loadedDirs].sort()).toEqual(["lib", "lib/deep"]);
	});

	// REGRESSION: a folder renamed before it was ever expanded kept its old key
	// in unloadedDirCandidates, so the expand subscriber never matched the new
	// key, fetchDir was never called, and the folder rendered empty. Every newly
	// created folder hits this, since creation registers a candidate and the
	// inline rename immediately renames it.
	it("moves the directory's own lazy-load candidate", () => {
		const state = bookkeeping({
			knownPaths: ["Untitled/"],
			unloadedDirCandidates: ["Untitled"],
		});

		rekeyDirectory(state, "Untitled", "docs");

		expect([...state.unloadedDirCandidates]).toEqual(["docs"]);
	});

	it("moves nested lazy-load candidates", () => {
		const state = bookkeeping({
			unloadedDirCandidates: ["src", "src/deep", "unrelated"],
		});

		rekeyDirectory(state, "src", "lib");

		expect([...state.unloadedDirCandidates].sort()).toEqual([
			"lib",
			"lib/deep",
			"unrelated",
		]);
	});

	it("leaves unrelated entries alone", () => {
		const state = bookkeeping({
			knownPaths: ["srcfile.ts", "source/"],
			loadedDirs: ["source"],
			unloadedDirCandidates: ["source"],
		});

		rekeyDirectory(state, "src", "lib");

		expect([...state.knownPaths].sort()).toEqual(["source/", "srcfile.ts"]);
		expect([...state.loadedDirs]).toEqual(["source"]);
		expect([...state.unloadedDirCandidates]).toEqual(["source"]);
	});
});

describe("purgeDirectory", () => {
	it("drops the directory and its descendants", () => {
		const state = bookkeeping({
			knownPaths: ["src/", "src/index.ts", "src/deep/", "other.ts"],
			loadedDirs: ["src", "src/deep", "other"],
			unloadedDirCandidates: ["src", "src/deep", "other"],
		});

		purgeDirectory(state, "src");

		// "src/" itself starts with the "src/" prefix, so it goes with the rest.
		expect([...state.knownPaths]).toEqual(["other.ts"]);
		expect([...state.loadedDirs]).toEqual(["other"]);
		expect([...state.unloadedDirCandidates]).toEqual(["other"]);
	});

	// A removed folder that kept its candidate would make a later folder of the
	// same name skip its fetch and render empty.
	it("drops the directory's own lazy-load candidate", () => {
		const state = bookkeeping({ unloadedDirCandidates: ["docs"] });

		purgeDirectory(state, "docs");

		expect([...state.unloadedDirCandidates]).toEqual([]);
	});

	it("leaves unrelated entries alone", () => {
		const state = bookkeeping({
			knownPaths: ["srcfile.ts"],
			loadedDirs: ["source"],
			unloadedDirCandidates: ["source"],
		});

		purgeDirectory(state, "src");

		expect([...state.knownPaths]).toEqual(["srcfile.ts"]);
		expect([...state.loadedDirs]).toEqual(["source"]);
		expect([...state.unloadedDirCandidates]).toEqual(["source"]);
	});
});
