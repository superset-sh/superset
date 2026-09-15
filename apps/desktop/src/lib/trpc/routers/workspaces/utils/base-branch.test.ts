import { describe, expect, test } from "bun:test";
import { resolvePrBaseBranch, resolveWorkspaceBaseBranch } from "./base-branch";

describe("resolveWorkspaceBaseBranch", () => {
	test("uses explicit base branch when provided", () => {
		const resolved = resolveWorkspaceBaseBranch({
			explicitBaseBranch: "release/2026-q1",
			workspaceBaseBranch: "feature/long-lived",
			defaultBranch: "main",
			knownBranches: ["main", "feature/long-lived"],
		});

		expect(resolved).toBe("release/2026-q1");
	});

	test("falls back to project workspace base branch when explicit is absent", () => {
		const resolved = resolveWorkspaceBaseBranch({
			workspaceBaseBranch: "feature/long-lived",
			defaultBranch: "main",
			knownBranches: ["main", "feature/long-lived"],
		});

		expect(resolved).toBe("feature/long-lived");
	});

	test("falls back to repository default branch when project preference is absent", () => {
		const resolved = resolveWorkspaceBaseBranch({
			defaultBranch: "main",
			knownBranches: ["main", "feature/long-lived"],
		});

		expect(resolved).toBe("main");
	});

	test("falls back to repository default when stored preference is stale", () => {
		const resolved = resolveWorkspaceBaseBranch({
			workspaceBaseBranch: "feature/deleted",
			defaultBranch: "main",
			knownBranches: ["main", "feature/long-lived"],
		});

		expect(resolved).toBe("main");
	});

	test("uses workspace base branch when knownBranches is unavailable (offline)", () => {
		const resolved = resolveWorkspaceBaseBranch({
			workspaceBaseBranch: "feature/long-lived",
			defaultBranch: "main",
		});
		expect(resolved).toBe("feature/long-lived");
	});
	test('falls back to "main" when no defaultBranch or workspaceBaseBranch is provided', () => {
		const resolved = resolveWorkspaceBaseBranch({});
		expect(resolved).toBe("main");
	});
});

describe("resolvePrBaseBranch", () => {
	test("uses the branch the PR merges into", () => {
		expect(
			resolvePrBaseBranch({
				baseRefName: "release/2026-q1",
				remoteBranches: ["main", "release/2026-q1"],
			}),
		).toBe("release/2026-q1");
	});

	test("ignores a base branch with no remote-tracking ref", () => {
		expect(
			resolvePrBaseBranch({
				baseRefName: "release/2026-q1",
				remoteBranches: ["main"],
			}),
		).toBeUndefined();
	});

	test("ignores a base branch that exists only locally", () => {
		// The changes view diffs against origin/<base>, so a local-only branch
		// would silently produce an empty diff.
		expect(
			resolvePrBaseBranch({
				baseRefName: "release/2026-q1",
				remoteBranches: [],
			}),
		).toBeUndefined();
	});

	test("keeps the base branch when branches cannot be listed (offline)", () => {
		expect(resolvePrBaseBranch({ baseRefName: "release/2026-q1" })).toBe(
			"release/2026-q1",
		);
	});

	test("ignores a missing or blank base branch", () => {
		expect(resolvePrBaseBranch({})).toBeUndefined();
		expect(
			resolvePrBaseBranch({ baseRefName: "   ", remoteBranches: ["main"] }),
		).toBeUndefined();
	});
});
