import { describe, expect, test } from "bun:test";
import {
	getAutomationRunWorkspaceIds,
	getNonAutomationRunWorkspaces,
	isAutomationRunWorkspace,
	isLegacyAutomationRunWorkspace,
} from "./automationRunVisibility";

describe("automation run sidebar visibility", () => {
	test("collects only automation run workspace ids", () => {
		const ids = getAutomationRunWorkspaceIds([
			{ v2WorkspaceId: "run-workspace-1" },
			{ v2WorkspaceId: null },
			{ workspaceId: "legacy-run-workspace-1" },
			{},
		]);

		expect([...ids].sort()).toEqual([
			"legacy-run-workspace-1",
			"run-workspace-1",
		]);
	});

	test("identifies automation-owned workspaces", () => {
		const ids = new Set(["run-workspace-1"]);

		expect(isAutomationRunWorkspace("run-workspace-1", ids)).toBe(true);
		expect(isAutomationRunWorkspace("user-workspace-1", ids)).toBe(false);
	});

	test("filters automation run workspaces from user sidebar workspaces", () => {
		const workspaces = [
			{ id: "user-workspace-1", name: "User Workspace" },
			{ id: "run-workspace-1", name: "Automation Run Workspace" },
		];

		expect(
			getNonAutomationRunWorkspaces(workspaces, new Set(["run-workspace-1"])),
		).toEqual([{ id: "user-workspace-1", name: "User Workspace" }]);
	});

	test("filters legacy automation run worktrees by automation name and timestamp branch", () => {
		const automationNames = new Set([
			"System resource report every 10 minutes",
		]);
		const legacyWorkspace = {
			id: "legacy-run-workspace-1",
			name: "System resource report every 10 minutes",
			branch: "system-resource-report-every-1-2026-06-13-07-21-13",
			type: "worktree",
			taskId: null,
		};

		expect(
			isLegacyAutomationRunWorkspace(legacyWorkspace, automationNames),
		).toBe(true);
		expect(
			getNonAutomationRunWorkspaces(
				[legacyWorkspace, { id: "user-workspace-1", name: "User Workspace" }],
				new Set(),
				automationNames,
			),
		).toEqual([{ id: "user-workspace-1", name: "User Workspace" }]);
	});

	test("keeps similarly named workspaces that are not legacy automation run worktrees", () => {
		const automationNames = new Set([
			"System resource report every 10 minutes",
		]);
		const workspace = {
			id: "manual-workspace-1",
			name: "System resource report every 10 minutes",
			branch: "feature/manual-analysis",
			type: "worktree",
			taskId: null,
		};

		expect(isLegacyAutomationRunWorkspace(workspace, automationNames)).toBe(
			false,
		);
	});
});
