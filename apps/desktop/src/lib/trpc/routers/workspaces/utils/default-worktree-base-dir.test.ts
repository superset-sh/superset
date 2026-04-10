import { describe, expect, test } from "bun:test";
import path from "node:path";
import { getDefaultWorktreeBaseDir } from "./default-worktree-base-dir";

describe("getDefaultWorktreeBaseDir", () => {
	test("uses stable ~/.superset/worktrees default base dir", () => {
		expect(getDefaultWorktreeBaseDir("/Users/tester")).toBe(
			path.join("/Users/tester", ".superset", "worktrees"),
		);
	});

	test("does not include workspace-name-scoped suffix", () => {
		const baseDir = getDefaultWorktreeBaseDir("/Users/tester");
		expect(baseDir.includes(".superset-open-workspace")).toBe(false);
	});
});
