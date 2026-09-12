import { describe, expect, it } from "bun:test";
import { countsTowardDockAttention } from "./countsTowardDockAttention";

describe("countsTowardDockAttention", () => {
	it("excludes session workspaces whose only attention signal is review", () => {
		expect(
			countsTowardDockAttention({
				status: "review",
				workspaceType: "session",
			}),
		).toBe(false);
	});

	it("still counts worktree and main workspaces in review", () => {
		expect(
			countsTowardDockAttention({
				status: "review",
				workspaceType: "worktree",
			}),
		).toBe(true);
		expect(
			countsTowardDockAttention({
				status: "review",
				workspaceType: "main",
			}),
		).toBe(true);
	});

	it("still counts session workspaces in permission or failed", () => {
		expect(
			countsTowardDockAttention({
				status: "permission",
				workspaceType: "session",
			}),
		).toBe(true);
		expect(
			countsTowardDockAttention({
				status: "failed",
				workspaceType: "session",
			}),
		).toBe(true);
	});

	it("does not count working or idle for any type", () => {
		expect(
			countsTowardDockAttention({
				status: "working",
				workspaceType: "worktree",
			}),
		).toBe(false);
		expect(
			countsTowardDockAttention({
				status: "idle",
				workspaceType: "session",
			}),
		).toBe(false);
	});

	it("counts review when the workspace type is not cached yet", () => {
		expect(
			countsTowardDockAttention({
				status: "review",
				workspaceType: undefined,
			}),
		).toBe(true);
	});
});
