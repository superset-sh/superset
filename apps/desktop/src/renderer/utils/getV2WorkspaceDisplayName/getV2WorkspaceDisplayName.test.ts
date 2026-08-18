import { describe, expect, it } from "bun:test";
import { getV2WorkspaceDisplayName } from "./getV2WorkspaceDisplayName";

describe("getV2WorkspaceDisplayName", () => {
	it("always displays main workspaces as 'local'", () => {
		expect(
			getV2WorkspaceDisplayName({
				type: "main",
				name: "some custom name",
				branch: "main",
			}),
		).toBe("local");
	});

	it("uses the worktree workspace name when set", () => {
		expect(
			getV2WorkspaceDisplayName({
				type: "worktree",
				name: "Fix login bug",
				branch: "fix-login-bug",
			}),
		).toBe("Fix login bug");
	});

	it("falls back to the branch for unnamed worktree workspaces", () => {
		expect(
			getV2WorkspaceDisplayName({
				type: "worktree",
				name: "",
				branch: "fix-login-bug",
			}),
		).toBe("fix-login-bug");
	});
});
