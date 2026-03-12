import { describe, expect, test } from "bun:test";
import {
	isAbsoluteFilesystemPath,
	toAbsoluteWorkspacePath,
} from "./absolute-paths";

describe("absolute-paths", () => {
	describe("isAbsoluteFilesystemPath", () => {
		test("recognizes unix absolute paths", () => {
			expect(isAbsoluteFilesystemPath("/usr/local/bin")).toBe(true);
			expect(isAbsoluteFilesystemPath("/home/user/.claude/plans/foo.md")).toBe(
				true,
			);
		});

		test("recognizes windows paths", () => {
			expect(isAbsoluteFilesystemPath("C:\\Users\\foo")).toBe(true);
			expect(isAbsoluteFilesystemPath("D:/Projects")).toBe(true);
		});

		test("recognizes UNC paths", () => {
			expect(isAbsoluteFilesystemPath("\\\\server\\share")).toBe(true);
		});

		test("returns false for relative paths", () => {
			expect(isAbsoluteFilesystemPath("src/file.ts")).toBe(false);
			expect(isAbsoluteFilesystemPath("./src/file.ts")).toBe(false);
			expect(isAbsoluteFilesystemPath("../src/file.ts")).toBe(false);
		});

		test("does not recognize tilde paths as absolute (#2372)", () => {
			// ~ paths are not filesystem-absolute (they need shell expansion),
			// so isAbsoluteFilesystemPath correctly returns false.
			// The fix for #2372 is in useFileLinkClick which detects ~ paths
			// and routes them to the external editor (which handles ~ expansion).
			expect(isAbsoluteFilesystemPath("~/.claude/plans/foo.md")).toBe(false);
			expect(isAbsoluteFilesystemPath("~/config/settings.json")).toBe(false);
		});
	});

	describe("toAbsoluteWorkspacePath", () => {
		test("returns absolute paths unchanged", () => {
			expect(toAbsoluteWorkspacePath("/workspace", "/usr/local/bin/node")).toBe(
				"/usr/local/bin/node",
			);
		});

		test("prepends worktree path for relative paths", () => {
			expect(toAbsoluteWorkspacePath("/workspace", "src/file.ts")).toBe(
				"/workspace/src/file.ts",
			);
		});

		test("returns remote paths unchanged", () => {
			expect(toAbsoluteWorkspacePath("/workspace", "https://example.com")).toBe(
				"https://example.com",
			);
		});

		test("tilde paths are treated as relative by toAbsoluteWorkspacePath (#2372)", () => {
			// This demonstrates the root cause: toAbsoluteWorkspacePath doesn't
			// know about ~, so it treats ~/path as a relative path and prepends
			// the worktree path, producing an invalid path like
			// "/workspace/~/.claude/plans/foo.md" which doesn't exist.
			//
			// The fix is upstream in useFileLinkClick: tilde paths are now
			// intercepted and routed to the external editor (which calls
			// resolvePath to expand ~ to the home directory) instead of being
			// passed to the file viewer where toAbsoluteWorkspacePath breaks them.
			const result = toAbsoluteWorkspacePath(
				"/workspace",
				"~/.claude/plans/foo.md",
			);
			expect(result).toBe("/workspace/~/.claude/plans/foo.md");
		});
	});
});
