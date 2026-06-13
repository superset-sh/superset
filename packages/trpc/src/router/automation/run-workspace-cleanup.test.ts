import { describe, expect, test } from "bun:test";
import {
	type AutomationRunWorkspaceCleanupTarget,
	decideAutomationRunWorkspaceCleanup,
} from "./run-workspace-cleanup-decision";

function target(
	overrides: Partial<AutomationRunWorkspaceCleanupTarget> = {},
): AutomationRunWorkspaceCleanupTarget {
	return {
		runId: "run-1",
		automationId: "automation-1",
		organizationId: "org-1",
		ownerUserId: "user-1",
		ownerEmail: "owner@example.com",
		hostId: "host-1",
		workspaceId: "run-workspace-1",
		automationWorkspaceId: null,
		...overrides,
	};
}

describe("decideAutomationRunWorkspaceCleanup", () => {
	test("cleans isolated run workspaces", () => {
		expect(decideAutomationRunWorkspaceCleanup(target())).toEqual({
			shouldCleanup: true,
		});
	});

	test("skips when the run has no host", () => {
		expect(
			decideAutomationRunWorkspaceCleanup(target({ hostId: null })),
		).toEqual({
			shouldCleanup: false,
			reason: "run has no host",
		});
	});

	test("skips when the run has no workspace", () => {
		expect(
			decideAutomationRunWorkspaceCleanup(target({ workspaceId: null })),
		).toEqual({
			shouldCleanup: false,
			reason: "run has no workspace",
		});
	});

	test("skips explicitly reused automation workspaces", () => {
		expect(
			decideAutomationRunWorkspaceCleanup(
				target({
					workspaceId: "shared-workspace-1",
					automationWorkspaceId: "shared-workspace-1",
				}),
			),
		).toEqual({
			shouldCleanup: false,
			reason: "automation is configured to reuse a workspace",
		});
	});
});
