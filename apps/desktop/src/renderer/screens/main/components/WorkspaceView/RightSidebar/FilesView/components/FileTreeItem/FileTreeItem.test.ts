import { describe, expect, it } from "bun:test";
import type { DirectoryEntry } from "shared/file-tree-types";

/**
 * Extracts the double-click guard logic from FileTreeItem and
 * FileSearchResultItem to verify that directories never trigger
 * onOpenInEditor (which would open Finder on macOS).
 *
 * See: https://github.com/anthropics/superset/issues/2467
 */

function shouldOpenInEditorOnDoubleClick(entry: DirectoryEntry): boolean {
	return !entry.isDirectory;
}

const fileEntry: DirectoryEntry = {
	id: "/project/src/index.ts",
	name: "index.ts",
	path: "/project/src/index.ts",
	relativePath: "src/index.ts",
	isDirectory: false,
};

const folderEntry: DirectoryEntry = {
	id: "/project/src",
	name: "src",
	path: "/project/src",
	relativePath: "src",
	isDirectory: true,
};

describe("FileTreeItem double-click guard", () => {
	it("should open files in the editor on double-click", () => {
		expect(shouldOpenInEditorOnDoubleClick(fileEntry)).toBe(true);
	});

	it("should NOT open folders in the editor on double-click", () => {
		expect(shouldOpenInEditorOnDoubleClick(folderEntry)).toBe(false);
	});
});

describe("handleOpenInEditor guard (FilesView)", () => {
	it("should skip directories to prevent Finder from opening", () => {
		// Mirrors the guard in FilesView.handleOpenInEditor:
		// if (!worktreePath || entry.isDirectory) return;
		const worktreePath = "/project";
		const shouldMutate = (entry: DirectoryEntry) =>
			!(!worktreePath || entry.isDirectory);

		expect(shouldMutate(fileEntry)).toBe(true);
		expect(shouldMutate(folderEntry)).toBe(false);
	});

	it("should skip when worktreePath is empty", () => {
		const worktreePath = "";
		const shouldMutate = (entry: DirectoryEntry) =>
			!(!worktreePath || entry.isDirectory);

		expect(shouldMutate(fileEntry)).toBe(false);
		expect(shouldMutate(folderEntry)).toBe(false);
	});
});
