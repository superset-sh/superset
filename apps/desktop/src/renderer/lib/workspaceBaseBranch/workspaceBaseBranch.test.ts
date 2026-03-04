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
		const resolved = resolveEffectiveWorkspaceBaseBranch({});

		expect(resolved).toBeNull();
	});

	test("trusts workspace base branch when branches are undefined (offline/loading)", () => {
		const resolved = resolveEffectiveWorkspaceBaseBranch({
			workspaceBaseBranch: "develop",
			defaultBranch: "main",
			branches: undefined,
		});

		expect(resolved).toBe("develop");
	});

	test("falls back to default branch when branches array is empty", () => {
		const resolved = resolveEffectiveWorkspaceBaseBranch({
			workspaceBaseBranch: "develop",
			defaultBranch: "main",
			branches: [],
		});

		expect(resolved).toBe("main");
	});

	test("ignores empty string explicit base branch", () => {
		const resolved = resolveEffectiveWorkspaceBaseBranch({
			explicitBaseBranch: "",
			workspaceBaseBranch: "develop",
			defaultBranch: "main",
			branches: [{ name: "main" }, { name: "develop" }],
		});

		expect(resolved).toBe("develop");
	});
});
