import { describe, expect, test } from "bun:test";
import {
	getDashboardModeForPath,
	getV2WorkspaceIdFromPath,
} from "./dashboardMode";

describe("dashboardMode", () => {
	test.each([
		["/v2-workspaces", "code"],
		["/v2-workspace/workspace-1", "code"],
		["/v2-workspace/workspace-1/", "code"],
		["/tasks", "code"],
		["/automations", "code"],
		["/chat", "chat"],
		["/chat/", "chat"],
		["/v2-workspace/workspace-1/chat", "chat"],
		["/v2-workspace/workspace-1/chat/", "chat"],
		["/work", "work"],
		["/work/", "work"],
		["/v2-workspace/workspace-1/work", "work"],
		["/v2-workspace/workspace-1/work/", "work"],
	] as const)("classifies %s as %s", (pathname, mode) => {
		expect(getDashboardModeForPath(pathname)).toBe(mode);
	});

	test.each([
		["/v2-workspace/workspace-1", "workspace-1"],
		["/v2-workspace/workspace-1/chat", "workspace-1"],
		["/v2-workspace/workspace-1/work", "workspace-1"],
		["/v2-workspaces", null],
		["/chat", null],
	] as const)("extracts workspace id from %s", (pathname, workspaceId) => {
		expect(getV2WorkspaceIdFromPath(pathname)).toBe(workspaceId);
	});
});
