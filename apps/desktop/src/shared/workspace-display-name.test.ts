import { describe, expect, it } from "bun:test";
import { getWorkspaceDisplayName } from "./workspace-display-name";

describe("getWorkspaceDisplayName", () => {
	it("always displays main workspaces as 'local'", () => {
		expect(
			getWorkspaceDisplayName({
				type: "main",
				name: "some custom name",
				branch: "main",
			}),
		).toBe("local");
	});

	it("uses the worktree workspace name when set", () => {
		expect(
			getWorkspaceDisplayName({
				type: "worktree",
				name: "Fix login bug",
				branch: "fix-login-bug",
			}),
		).toBe("Fix login bug");
	});

	it("falls back to the branch for unnamed worktree workspaces", () => {
		expect(
			getWorkspaceDisplayName({
				type: "worktree",
				name: "",
				branch: "fix-login-bug",
			}),
		).toBe("fix-login-bug");
	});
});
