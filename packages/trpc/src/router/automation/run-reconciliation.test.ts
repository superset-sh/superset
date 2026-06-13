import { describe, expect, test } from "bun:test";
import type { SelectAutomationRun } from "@superset/db/schema";
import { decideAutomationRunReconciliation } from "./run-reconciliation";

function run(
	overrides: Partial<SelectAutomationRun> = {},
): SelectAutomationRun {
	return {
		id: "run-1",
		automationId: "automation-1",
		organizationId: "org-1",
		title: "Report",
		source: "manual",
		scheduledFor: new Date("2026-06-12T09:00:00.000Z"),
		hostId: null,
		v2WorkspaceId: null,
		sessionKind: null,
		chatSessionId: null,
		terminalSessionId: null,
		status: "running",
		error: null,
		failureReason: null,
		resultMarkdown: null,
		resultJson: null,
		resultSummary: null,
		resultSource: null,
		terminalExitCode: null,
		startedAt: new Date("2026-06-12T09:00:01.000Z"),
		completedAt: null,
		dispatchedAt: new Date("2026-06-12T09:00:01.000Z"),
		createdAt: new Date("2026-06-12T09:00:00.000Z"),
		updatedAt: new Date("2026-06-12T09:00:01.000Z"),
		...overrides,
	};
}

describe("decideAutomationRunReconciliation", () => {
	test("fails stale active runs", () => {
		const decision = decideAutomationRunReconciliation(run(), {
			now: new Date("2026-06-12T12:00:01.000Z"),
			staleTimeoutMs: 60 * 60 * 1000,
		});

		expect(decision.shouldFail).toBe(true);
		expect(decision.failureReason).toContain("did not write back a result");
	});

	test("does not fail recent active runs", () => {
		const decision = decideAutomationRunReconciliation(run(), {
			now: new Date("2026-06-12T09:10:01.000Z"),
			staleTimeoutMs: 60 * 60 * 1000,
		});

		expect(decision.shouldFail).toBe(false);
	});

	test("does not mutate terminal runs", () => {
		const decision = decideAutomationRunReconciliation(
			run({
				status: "completed",
				completedAt: new Date("2026-06-12T09:05:00.000Z"),
				resultMarkdown: "# Done",
			}),
			{
				now: new Date("2026-06-13T09:00:00.000Z"),
				staleTimeoutMs: 60 * 60 * 1000,
			},
		);

		expect(decision.shouldFail).toBe(false);
	});
});
