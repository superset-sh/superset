import { beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

// Mock localDb before importing the module under test
const mockGet = mock(() => undefined as Record<string, unknown> | undefined);
mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				get: mockGet,
			}),
		}),
	},
}));

// Mock homedir for deterministic paths
mock.module("node:os", () => ({
	homedir: () => "/home/testuser",
}));

// Import after mocking
const { resolveWorktreePath } = await import("./resolve-worktree-path");

describe("resolveWorktreePath", () => {
	beforeEach(() => {
		mockGet.mockReset();
		mockGet.mockReturnValue(undefined);
	});

	test("uses project-level worktreeBaseDir override when set", () => {
		const result = resolveWorktreePath(
			{
				name: "my-project",
				worktreeBaseDir: "/custom/project/dir",
				mainRepoPath: "/home/testuser/dev/my-project",
			},
			"feature-branch",
		);

		expect(result).toBe(
			join("/custom/project/dir", "my-project", "feature-branch"),
		);
	});

	test("uses global worktreeBaseDir setting when no project override", () => {
		mockGet.mockReturnValue({ worktreeBaseDir: "/global/worktrees" });

		const result = resolveWorktreePath(
			{
				name: "my-project",
				worktreeBaseDir: null,
				mainRepoPath: "/home/testuser/dev/my-project",
			},
			"feature-branch",
		);

		expect(result).toBe(
			join("/global/worktrees", "my-project", "feature-branch"),
		);
	});

	test("falls back to default ~/.superset/worktrees when no overrides", () => {
		mockGet.mockReturnValue({});

		const result = resolveWorktreePath(
			{
				name: "my-project",
				worktreeBaseDir: null,
				mainRepoPath: "/home/testuser/dev/my-project",
			},
			"feature-branch",
		);

		expect(result).toBe(
			join(
				"/home/testuser",
				".superset",
				"worktrees",
				"my-project",
				"feature-branch",
			),
		);
	});

	test("creates worktrees inside project root when useProjectLocalWorktrees is enabled", () => {
		mockGet.mockReturnValue({ useProjectLocalWorktrees: true });

		const result = resolveWorktreePath(
			{
				name: "my-project",
				worktreeBaseDir: null,
				mainRepoPath: "/home/testuser/dev/my-project",
			},
			"feature-branch",
		);

		expect(result).toBe(
			join("/home/testuser/dev/my-project", ".worktrees", "feature-branch"),
		);
	});

	test("project-level worktreeBaseDir takes priority over useProjectLocalWorktrees", () => {
		mockGet.mockReturnValue({ useProjectLocalWorktrees: true });

		const result = resolveWorktreePath(
			{
				name: "my-project",
				worktreeBaseDir: "/custom/project/dir",
				mainRepoPath: "/home/testuser/dev/my-project",
			},
			"feature-branch",
		);

		expect(result).toBe(
			join("/custom/project/dir", "my-project", "feature-branch"),
		);
	});

	test("useProjectLocalWorktrees takes priority over global worktreeBaseDir", () => {
		mockGet.mockReturnValue({
			worktreeBaseDir: "/global/worktrees",
			useProjectLocalWorktrees: true,
		});

		const result = resolveWorktreePath(
			{
				name: "my-project",
				worktreeBaseDir: null,
				mainRepoPath: "/home/testuser/dev/my-project",
			},
			"feature-branch",
		);

		expect(result).toBe(
			join("/home/testuser/dev/my-project", ".worktrees", "feature-branch"),
		);
	});
});
