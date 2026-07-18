import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	projectDirName,
	projectWorktreesRoot,
	safeResolveWorktreePath,
} from "./worktree-paths";

// Regression coverage for #5763: worktrees were being created under the
// project's opaque UUID id (e.g. `<base>/<uuid>/<branch>`), which users can't
// recognize on disk. The path segment should be the human-readable repo folder
// name, matching the desktop path builder (`resolve-worktree-path.ts`).
describe("projectDirName", () => {
	test("uses the repo folder name, never the opaque project id", () => {
		const project = {
			id: "0f8fad5b-d9cb-469f-a165-70867728950e",
			repoPath: "/Users/dev/code/bla",
		};

		expect(projectDirName(project)).toBe("bla");
		expect(projectDirName(project)).not.toBe(project.id);
	});
});

describe("safeResolveWorktreePath", () => {
	const projectId = "0f8fad5b-d9cb-469f-a165-70867728950e";
	const project = { id: projectId, repoPath: "/Users/dev/code/bla" };
	const worktreeBaseDir = "/Users/dev/code/bla/.claude/worktrees";

	test("nests the branch under the repo name, not the UUID", () => {
		const worktreePath = safeResolveWorktreePath(
			projectDirName(project),
			"caterwauling-galliform",
			worktreeBaseDir,
		);

		// Expected: `<base>/bla/caterwauling-galliform`
		expect(worktreePath).toBe(
			join(worktreeBaseDir, "bla", "caterwauling-galliform"),
		);
		// The UUID must not appear anywhere in the resolved path.
		expect(worktreePath).not.toContain(projectId);
	});

	test("falls back to the default worktrees root", () => {
		const worktreePath = safeResolveWorktreePath(
			projectDirName(project),
			"caterwauling-galliform",
		);

		expect(worktreePath).toBe(
			join(
				homedir(),
				".superset",
				"worktrees",
				"bla",
				"caterwauling-galliform",
			),
		);
	});

	test("still rejects path traversal in the branch name", () => {
		expect(() =>
			safeResolveWorktreePath(
				projectDirName(project),
				"../../../etc/passwd",
				worktreeBaseDir,
			),
		).toThrow(/path traversal/);
	});
});

describe("projectWorktreesRoot", () => {
	test("places the project dir under the base", () => {
		expect(projectWorktreesRoot("bla", "/base")).toBe(join("/base", "bla"));
	});
});
