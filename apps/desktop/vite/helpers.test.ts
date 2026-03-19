import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { getMonorepoRoot } from "./helpers";

describe("getMonorepoRoot", () => {
	test("returns the monorepo root (three levels above the vite/ directory)", () => {
		const root = getMonorepoRoot();
		// __dirname inside helpers.ts is apps/desktop/vite
		// so monorepo root = apps/desktop/vite/../../.. = repo root
		const expected = resolve(__dirname, "../../..");
		expect(root).toBe(expected);
	});

	test("resolves correctly for a path simulating a .git/ worktree location", () => {
		// Simulates: repo/.git/worktrees/my-branch/apps/desktop/vite
		const worktreeViteDir = "/repo/.git/worktrees/my-branch/apps/desktop/vite";
		const root = getMonorepoRoot(worktreeViteDir);
		// Should resolve to /repo/.git/worktrees/my-branch (the worktree's monorepo root)
		expect(root).toBe("/repo/.git/worktrees/my-branch");
	});

	test("result does not end with a path separator", () => {
		const root = getMonorepoRoot();
		expect(root.endsWith("/")).toBe(false);
		expect(root.endsWith("\\")).toBe(false);
	});
});
