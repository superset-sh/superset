import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { resolveCwd } from "./resolve-cwd";

describe("resolveCwd", () => {
	// Use os.tmpdir() for cross-platform temp directory
	const testDir = join(os.tmpdir(), "resolve-cwd-test");
	const worktreePath = join(testDir, "worktree");
	const existingSubdir = join(worktreePath, "apps/desktop");
	const homedir = os.homedir();

	beforeAll(() => {
		// Create test directories
		mkdirSync(existingSubdir, { recursive: true });
	});

	afterAll(() => {
		// Clean up test directories
		rmSync(testDir, { recursive: true, force: true });
	});

	describe("when cwdOverride is undefined", () => {
		test("returns worktreePath when it exists", () => {
			expect(resolveCwd(undefined, worktreePath)).toBe(worktreePath);
		});

		test("returns undefined when worktreePath is also undefined", () => {
			expect(resolveCwd(undefined, undefined)).toBeUndefined();
		});

		test("returns undefined when worktreePath does not exist", () => {
			expect(resolveCwd(undefined, "/nonexistent/path")).toBeUndefined();
		});
	});

	describe("when cwdOverride is absolute", () => {
		test("returns absolute path if it exists", () => {
			// Use os.tmpdir() which exists on all platforms
			const tmpDir = os.tmpdir();
			expect(resolveCwd(tmpDir, worktreePath)).toBe(tmpDir);
		});

		test("falls back to worktreePath when absolute path does not exist", () => {
			const nonExistentPath = "/this/path/does/not/exist";
			expect(resolveCwd(nonExistentPath, worktreePath)).toBe(worktreePath);
		});

		test("falls back to homedir when absolute path does not exist and worktreePath is undefined", () => {
			const nonExistentPath = "/this/path/does/not/exist";
			expect(resolveCwd(nonExistentPath, undefined)).toBe(homedir);
		});

		test("falls back to homedir when both absolute path and worktreePath do not exist", () => {
			const nonExistentPath = "/this/path/does/not/exist";
			expect(resolveCwd(nonExistentPath, "/also/nonexistent")).toBe(homedir);
		});
	});

	describe("when cwdOverride is relative", () => {
		test("resolves relative path against worktreePath when path exists", () => {
			expect(resolveCwd("apps/desktop", worktreePath)).toBe(existingSubdir);
		});

		test("resolves ./ prefixed path against worktreePath when path exists", () => {
			expect(resolveCwd("./apps/desktop", worktreePath)).toBe(existingSubdir);
		});

		test("falls back to worktreePath when relative path does not exist", () => {
			expect(resolveCwd("non-existent-dir", worktreePath)).toBe(worktreePath);
		});

		test("falls back to worktreePath when ./ prefixed path does not exist", () => {
			expect(resolveCwd("./non-existent-dir", worktreePath)).toBe(worktreePath);
		});

		test("handles . as current directory", () => {
			expect(resolveCwd(".", worktreePath)).toBe(worktreePath);
		});

		test("falls back to homedir when worktreePath is undefined", () => {
			expect(resolveCwd("apps/desktop", undefined)).toBe(homedir);
		});

		test("falls back to homedir when worktreePath does not exist", () => {
			expect(resolveCwd("apps/desktop", "/nonexistent/path")).toBe(homedir);
		});
	});
});
