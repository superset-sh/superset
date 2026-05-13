import { describe, expect, test } from "bun:test";
import { planWorkspaceSwitch } from "./planWorkspaceSwitch";

describe("planWorkspaceSwitch", () => {
	test("does nothing when workspaceId is empty (no workspace mounted yet)", () => {
		expect(planWorkspaceSwitch({ workspaceId: "", rootPath: "" })).toEqual({
			resetState: false,
			fetchRoot: false,
		});
	});

	test("does nothing when workspaceId is empty even if a stale rootPath remains", () => {
		expect(
			planWorkspaceSwitch({ workspaceId: "", rootPath: "/old/path" }),
		).toEqual({
			resetState: false,
			fetchRoot: false,
		});
	});

	// Regression for #4501: the previous early-return left the previous
	// workspace's files visible during the gap between switching workspaceId
	// and the new workspace's worktreePath query resolving. The reset MUST
	// fire on workspace switch even when rootPath isn't known yet.
	test("clears state when workspaceId is set but rootPath is not yet loaded", () => {
		expect(planWorkspaceSwitch({ workspaceId: "ws-b", rootPath: "" })).toEqual({
			resetState: true,
			fetchRoot: false,
		});
	});

	test("clears state and fetches root when both workspaceId and rootPath are available", () => {
		expect(
			planWorkspaceSwitch({ workspaceId: "ws-b", rootPath: "/b" }),
		).toEqual({
			resetState: true,
			fetchRoot: true,
		});
	});
});
