import { describe, expect, test } from "bun:test";
import type { SelectAutomationRun } from "@superset/db/schema";
import {
	mergeAutomationRuns,
	mergeSelectedAutomationRun,
	pickFreshestAutomationRun,
} from "./automationRunSelection";

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

describe("automationRunSelection", () => {
	test("prefers the fetched run when it is fresher than the live row", () => {
		const liveRun = run();
		const fetchedRun = run({
			status: "completed",
			resultMarkdown: "# Done",
			resultSource: "agent_writeback",
			completedAt: new Date("2026-06-12T09:00:30.000Z"),
			updatedAt: new Date("2026-06-12T09:00:30.000Z"),
		});

		expect(pickFreshestAutomationRun(liveRun, fetchedRun)).toBe(fetchedRun);
	});

	test("replaces a stale selected row in previous runs", () => {
		const staleRun = run();
		const freshRun = run({
			status: "completed",
			resultMarkdown: "# Done",
			completedAt: new Date("2026-06-12T09:00:30.000Z"),
			updatedAt: new Date("2026-06-12T09:00:30.000Z"),
		});

		const merged = mergeSelectedAutomationRun([staleRun], freshRun);

		expect(merged).toHaveLength(1);
		expect(merged[0]).toBe(freshRun);
	});

	test("prepends selected run when Electric has not listed it yet", () => {
		const selectedRun = run({ id: "selected-run" });
		const existingRun = run({ id: "existing-run" });

		expect(mergeSelectedAutomationRun([existingRun], selectedRun)).toEqual([
			selectedRun,
			existingRun,
		]);
	});

	test("merges freshly fetched run history with cached Electric rows", () => {
		const cachedOnlyRun = run({
			id: "cached-run",
			createdAt: new Date("2026-06-12T09:00:00.000Z"),
		});
		const staleLiveRun = run({
			id: "shared-run",
			status: "running",
			createdAt: new Date("2026-06-12T09:01:00.000Z"),
			updatedAt: new Date("2026-06-12T09:01:01.000Z"),
		});
		const freshFetchedRun = run({
			id: "shared-run",
			status: "completed",
			resultMarkdown: "# Done",
			createdAt: new Date("2026-06-12T09:01:00.000Z"),
			completedAt: new Date("2026-06-12T09:01:30.000Z"),
			updatedAt: new Date("2026-06-12T09:01:30.000Z"),
		});
		const fetchedOnlyRun = run({
			id: "fetched-run",
			createdAt: new Date("2026-06-12T09:02:00.000Z"),
		});

		const merged = mergeAutomationRuns(
			[cachedOnlyRun, staleLiveRun],
			[freshFetchedRun, fetchedOnlyRun],
		);

		expect(merged.map((item) => item.id)).toEqual([
			"fetched-run",
			"shared-run",
			"cached-run",
		]);
		expect(merged[1]).toBe(freshFetchedRun);
	});
});
