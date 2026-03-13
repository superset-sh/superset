import { describe, expect, test } from "bun:test";
import { resolveWorkspaceBaseBranch } from "./base-branch";

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

describe("resolveWorkspaceBaseBranch — workspace-init re-derivation (issue #2353)", () => {
	/**
	 * Reproduces the bug where a user-selected explicit base branch is lost when
	 * initializeWorkspaceWorktree re-derives the base branch without the explicit
	 * selection and without knownBranches. Before the fix, the init function would
	 * call resolveWorkspaceBaseBranch without explicitBaseBranch, causing it to
	 * fall back to projectDefault/main instead of the user's choice.
	 */
	test("explicit base branch is lost when re-resolved without explicitBaseBranch", () => {
		// Step 1: User selects "develop" as the base branch in the create modal.
		// The create procedure correctly resolves it:
		const createResolved = resolveWorkspaceBaseBranch({
			explicitBaseBranch: "develop",
			workspaceBaseBranch: null,
			defaultBranch: "main",
			knownBranches: ["main", "develop", "staging"],
		});
		expect(createResolved).toBe("develop");

		// Step 2: initializeWorkspaceWorktree re-derives the base branch
		// WITHOUT the explicit selection (simulating git config read failure).
		// This is the buggy path: without the caller-provided baseBranch,
		// the init function falls back to project defaults.
		const initResolved = resolveWorkspaceBaseBranch({
			// explicitBaseBranch is NOT passed — this is the bug
			workspaceBaseBranch: null,
			defaultBranch: "main",
			// knownBranches is also NOT passed in workspace-init
		});

		// BUG: initResolved is "main" instead of "develop"
		// The user's explicit selection has been silently lost
		expect(initResolved).toBe("main");
		expect(initResolved).not.toBe(createResolved);
	});

	test("explicit base branch is lost even with project workspaceBaseBranch set", () => {
		// User selects "release/v2" but project default is "develop"
		const createResolved = resolveWorkspaceBaseBranch({
			explicitBaseBranch: "release/v2",
			workspaceBaseBranch: "develop",
			defaultBranch: "main",
			knownBranches: ["main", "develop", "release/v2"],
		});
		expect(createResolved).toBe("release/v2");

		// Init re-derives without explicit — gets project default, not user's choice
		const initResolved = resolveWorkspaceBaseBranch({
			workspaceBaseBranch: "develop",
			defaultBranch: "main",
		});
		expect(initResolved).toBe("develop");
		expect(initResolved).not.toBe(createResolved);
	});

	test("caller-provided baseBranch preserves the user selection (the fix)", () => {
		// After the fix, the caller provides baseBranch directly.
		// This simulates the fixed flow where initializeWorkspaceWorktree
		// receives baseBranch from the create procedure.
		const callerBaseBranch = "develop";
		const gitConfigBase: string | null = null; // simulate config read failure

		// The fixed resolution logic:
		// callerBaseBranch || gitConfigBase || resolveWorkspaceBaseBranch(...)
		const effectiveBaseBranch =
			callerBaseBranch ||
			gitConfigBase ||
			resolveWorkspaceBaseBranch({
				workspaceBaseBranch: null,
				defaultBranch: "main",
			});

		expect(effectiveBaseBranch).toBe("develop");
	});

	test("falls back to git config when caller baseBranch is not provided", () => {
		const callerBaseBranch: string | undefined = undefined;
		const gitConfigBase = "staging"; // simulate successful config read

		const effectiveBaseBranch =
			callerBaseBranch ||
			gitConfigBase ||
			resolveWorkspaceBaseBranch({
				workspaceBaseBranch: null,
				defaultBranch: "main",
			});

		expect(effectiveBaseBranch).toBe("staging");
	});

	test("falls back to project defaults when neither caller nor git config provide baseBranch", () => {
		const callerBaseBranch: string | undefined = undefined;
		const gitConfigBase: string | null = null;

		const effectiveBaseBranch =
			callerBaseBranch ||
			gitConfigBase ||
			resolveWorkspaceBaseBranch({
				workspaceBaseBranch: "develop",
				defaultBranch: "main",
			});

		expect(effectiveBaseBranch).toBe("develop");
	});
});
