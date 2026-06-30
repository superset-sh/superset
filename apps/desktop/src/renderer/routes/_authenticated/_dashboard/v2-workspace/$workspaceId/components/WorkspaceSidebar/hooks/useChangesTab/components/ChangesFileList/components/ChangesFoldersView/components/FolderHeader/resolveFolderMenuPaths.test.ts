import { describe, expect, test } from "bun:test";
import { resolveFolderMenuPaths } from "./resolveFolderMenuPaths";

const WORKTREE = "/Users/dev/work/my-repo";

describe("resolveFolderMenuPaths", () => {
	test("resolves a nested folder to an absolute path and keeps its relative path", () => {
		expect(resolveFolderMenuPaths("src/components", WORKTREE)).toEqual({
			absolutePath: `${WORKTREE}/src/components`,
			relativePath: "src/components",
		});
	});

	// Reproduces #5043: the folders view includes a synthetic root group keyed by
	// "". `toAbsoluteWorkspacePath(wt, "")` returns "" (no-op on empty input), so
	// without explicit handling the root folder's context menu would have no
	// usable path and the path actions (Copy Path / Reveal in Finder) would be
	// unavailable — actions that ARE available on directory rows in the tree view.
	test("resolves the root group to the worktree root with no relative path", () => {
		expect(resolveFolderMenuPaths("", WORKTREE)).toEqual({
			absolutePath: WORKTREE,
		});
	});

	test("returns no paths when the worktree path is unknown", () => {
		expect(resolveFolderMenuPaths("src/components", undefined)).toEqual({});
		expect(resolveFolderMenuPaths("", undefined)).toEqual({});
	});
});
