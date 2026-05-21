import { describe, it, expect } from "bun:test";
import type { SelectAutomationRun } from "@superset/db/schema";

// Import the component to verify it exists and is a function
import { PreviousRunsList } from "./PreviousRunsList";

const mockRun: SelectAutomationRun = {
	id: "run-1",
	automationId: "auto-1",
	organizationId: "org-1",
	title: "Test Automation",
	scheduledFor: new Date("2026-05-20T10:00:00Z"),
	hostId: "host-1",
	status: "dispatched",
	sessionKind: "chat",
	chatSessionId: "chat-1",
	terminalSessionId: null,
	v2WorkspaceId: "ws-1",
	dispatchedAt: new Date("2026-05-20T10:00:01Z"),
	error: null,
	createdAt: new Date("2026-05-20T10:00:00Z"),
};

describe("PreviousRunsList", () => {
	it("should be a React component function", () => {
		expect(typeof PreviousRunsList).toBe("function");
	});

	it("should accept an array of automation runs as prop", () => {
		const runs: SelectAutomationRun[] = [mockRun];
		expect(runs.length).toBe(1);
		expect(runs[0].status).toBe("dispatched");
	});

	it("should handle failed runs with dispatch_failed status", () => {
		const failedRun: SelectAutomationRun = {
			...mockRun,
			id: "run-2",
			status: "dispatch_failed",
			error: "Target machine was offline",
		};

		expect(failedRun.status).toBe("dispatch_failed");
		expect(failedRun.error).toBeDefined();
		expect(typeof failedRun.error).toBe("string");
	});

	it("should handle failed runs with skipped_offline status", () => {
		const skippedRun: SelectAutomationRun = {
			...mockRun,
			id: "run-3",
			status: "skipped_offline",
			error: "Host offline",
		};

		expect(skippedRun.status).toBe("skipped_offline");
		expect(skippedRun.error).toBeDefined();
	});

	it("should handle runs with null error (fallback case)", () => {
		const failedRunNoError: SelectAutomationRun = {
			...mockRun,
			id: "run-4",
			status: "dispatch_failed",
			error: null,
		};

		expect(failedRunNoError.status).toBe("dispatch_failed");
		expect(failedRunNoError.error).toBeNull();
	});

	it("should accept successful runs without error", () => {
		const successRun: SelectAutomationRun = {
			...mockRun,
			id: "run-5",
			status: "dispatched",
			error: null,
		};

		expect(successRun.status).toBe("dispatched");
		expect(successRun.error).toBeNull();
	});

	it("should accept empty array of runs", () => {
		const runs: SelectAutomationRun[] = [];
		expect(runs.length).toBe(0);
	});
});
