import { describe, expect, test } from "bun:test";
import type { SelectTaskStatus } from "@superset/db/schema";
import {
	resolveInProgressStatus,
	shouldTransitionToInProgress,
} from "./resolveInProgressStatus";

function makeStatus(
	overrides: Partial<SelectTaskStatus> & { id: string; type: string },
): SelectTaskStatus {
	return {
		name: "Status",
		color: "#000",
		position: 0,
		progressPercent: null,
		organizationId: "org-1",
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	} as SelectTaskStatus;
}

describe("resolveInProgressStatus", () => {
	test("returns the first status with type 'started'", () => {
		const statuses = [
			makeStatus({ id: "s1", type: "backlog", name: "Backlog" }),
			makeStatus({ id: "s2", type: "unstarted", name: "Todo" }),
			makeStatus({ id: "s3", type: "started", name: "In Progress" }),
			makeStatus({ id: "s4", type: "completed", name: "Done" }),
		];
		const result = resolveInProgressStatus(statuses);
		expect(result).not.toBeNull();
		expect(result?.id).toBe("s3");
		expect(result?.type).toBe("started");
	});

	test("returns null when no 'started' status exists", () => {
		const statuses = [
			makeStatus({ id: "s1", type: "backlog", name: "Backlog" }),
			makeStatus({ id: "s2", type: "unstarted", name: "Todo" }),
			makeStatus({ id: "s4", type: "completed", name: "Done" }),
		];
		expect(resolveInProgressStatus(statuses)).toBeNull();
	});

	test("returns null for empty array", () => {
		expect(resolveInProgressStatus([])).toBeNull();
	});

	test("returns the first 'started' status when multiple exist", () => {
		const statuses = [
			makeStatus({ id: "s1", type: "started", name: "In Progress" }),
			makeStatus({ id: "s2", type: "started", name: "In Review" }),
		];
		const result = resolveInProgressStatus(statuses);
		expect(result?.id).toBe("s1");
	});
});

describe("shouldTransitionToInProgress", () => {
	const inProgress = makeStatus({
		id: "s3",
		type: "started",
		name: "In Progress",
	});

	test("returns true when task status differs from in-progress status", () => {
		expect(shouldTransitionToInProgress("s1", inProgress)).toBe(true);
	});

	test("returns false when task already has the in-progress status", () => {
		expect(shouldTransitionToInProgress("s3", inProgress)).toBe(false);
	});

	test("returns false when no in-progress status is available", () => {
		expect(shouldTransitionToInProgress("s1", null)).toBe(false);
	});
});
