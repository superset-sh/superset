import { describe, expect, it } from "bun:test";
import { getNotificationWorkspaceName } from "./getNotificationWorkspaceName";

describe("getNotificationWorkspaceName", () => {
	it("uses the workspace name, trimmed", () => {
		expect(
			getNotificationWorkspaceName({
				type: "local",
				name: "  refactor auth ",
				branch: "main",
			}),
		).toBe("refactor auth");
	});

	it("falls back to the branch, then to a generic label", () => {
		expect(
			getNotificationWorkspaceName({
				type: "worktree",
				name: " ",
				branch: "feat/x",
			}),
		).toBe("feat/x");
		expect(
			getNotificationWorkspaceName({ type: "session", name: "", branch: "" }),
		).toBe("Workspace");
	});
});
