import { describe, expect, test } from "bun:test";
import type { SelectAutomationRun } from "@superset/db/schema";
import {
	getAutomationRunError,
	getAutomationRunSourceLabel,
	getAutomationRunStatusView,
	isAutomationRunTerminal,
} from "./automationRunDisplay";

function run(status: SelectAutomationRun["status"]): SelectAutomationRun {
	return {
		id: "run-1",
		automationId: "automation-1",
		organizationId: "org-1",
		title: "Report",
		source: "manual",
		scheduledFor: new Date(),
		hostId: null,
		v2WorkspaceId: null,
		sessionKind: null,
		chatSessionId: null,
		terminalSessionId: null,
		status,
		error: null,
		failureReason: null,
		resultMarkdown: null,
		resultJson: null,
		resultSummary: null,
		resultSource: null,
		terminalExitCode: null,
		startedAt: null,
		completedAt: null,
		dispatchedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

describe("automationRunDisplay", () => {
	test("maps running and terminal statuses", () => {
		expect(getAutomationRunStatusView("running").label).toBe("Running");
		expect(isAutomationRunTerminal(run("running"))).toBe(false);
		expect(isAutomationRunTerminal(run("completed"))).toBe(true);
		expect(isAutomationRunTerminal(run("failed"))).toBe(true);
	});

	test("prefers failureReason over legacy error", () => {
		const item = run("failed");
		item.error = "legacy";
		item.failureReason = "specific reason";
		expect(getAutomationRunError(item)).toBe("specific reason");
	});

	test("labels run source", () => {
		expect(getAutomationRunSourceLabel("manual")).toBe("Manual");
		expect(getAutomationRunSourceLabel("schedule")).toBe("Scheduled");
	});
});
