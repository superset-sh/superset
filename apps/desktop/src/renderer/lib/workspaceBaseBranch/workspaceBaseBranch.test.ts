import { describe, expect, test } from "bun:test";
import { resolveEffectiveWorkspaceBaseBranch } from "./workspaceBaseBranch";

describe("resolveEffectiveWorkspaceBaseBranch", () => {
	test("prefers explicit base branch", () => {
		const resolved = resolveEffectiveWorkspaceBaseBranch({
			explicitBaseBranch: "release/2026-q1",
			workspaceBaseBranch: "feature/preferred",
			defaultBranch: "main",
			branches: [{ name: "main" }, { name: "feature/preferred" }],
		});

		expect(resolved).toBe("release/2026-q1");
	});

	test("uses workspace base branch when branch exists", () => {
		const resolved = resolveEffectiveWorkspaceBaseBranch({
			workspaceBaseBranch: "feature/preferred",
			defaultBranch: "main",
			branches: [{ name: "main" }, { name: "feature/preferred" }],
		});

		expect(resolved).toBe("feature/preferred");
	});

	test("falls back to default branch when workspace branch is stale", () => {
		const resolved = resolveEffectiveWorkspaceBaseBranch({
			workspaceBaseBranch: "feature/deleted",
			defaultBranch: "main",
			branches: [{ name: "main" }, { name: "feature/preferred" }],
		});

		expect(resolved).toBe("main");
	});

	test("returns null when nothing resolves", () => {
		const resolved = resolveEffectiveWorkspaceBaseBranch({
			workspaceBaseBranch: "feature/deleted",
		});

		expect(resolved).toBeNull();
	});
});
