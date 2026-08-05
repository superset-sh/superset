import { describe, expect, test } from "bun:test";
import { resolveRowDragPath } from "./useFilesTabDragSource.utils";

describe("resolveRowDragPath", () => {
	test("resolves a relative file path to an absolute workspace path", () => {
		expect(resolveRowDragPath("src/index.ts", "/repo/worktree")).toBe(
			"/repo/worktree/src/index.ts",
		);
	});

	test("resolves a folder path without preserving Pierre's trailing slash", () => {
		expect(resolveRowDragPath("src/components/", "/repo/worktree")).toBe(
			"/repo/worktree/src/components",
		);
	});

	test("returns null when the row path is missing", () => {
		expect(resolveRowDragPath(null, "/repo/worktree")).toBeNull();
		expect(resolveRowDragPath("", "/repo/worktree")).toBeNull();
	});

	test("returns null when the workspace root is missing", () => {
		expect(resolveRowDragPath("src/index.ts", "")).toBeNull();
	});
});
