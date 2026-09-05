import { describe, expect, it } from "bun:test";
import { getNotificationWorkspaceName } from "./getNotificationWorkspaceName";

describe("getNotificationWorkspaceName", () => {
	it("names main workspaces 'local' even when the stored name is stale", () => {
		expect(
			getNotificationWorkspaceName({
				type: "main",
				name: "feat/error-capture-audit",
				branch: "mvp",
			}),
		).toBe("local");
	});

	it("uses the worktree workspace name when set", () => {
		expect(
			getNotificationWorkspaceName({
				type: "worktree",
				name: "Fix login bug",
				branch: "fix-login-bug",
			}),
		).toBe("Fix login bug");
	});

	it("falls back to the branch for unnamed worktree workspaces", () => {
		expect(
			getNotificationWorkspaceName({
				type: "worktree",
				name: "  ",
				branch: "fix-login-bug",
			}),
		).toBe("fix-login-bug");
	});

	it("falls back to 'Workspace' when name and branch are empty", () => {
		expect(
			getNotificationWorkspaceName({ type: "worktree", name: "", branch: "" }),
		).toBe("Workspace");
	});
});
