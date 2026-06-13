import { describe, expect, test } from "bun:test";
import {
	completeRunSchema,
	createAutomationSchema,
	failRunSchema,
	reconcileRunSchema,
} from "./schema";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

describe("automation run writeback schemas", () => {
	test("allows creating an automation without project or workspace context", () => {
		const parsed = createAutomationSchema.parse({
			name: "Memory report",
			prompt: "Report memory usage.",
			agent: "claude",
			targetHostId: "host-1",
			rrule: "FREQ=HOURLY;INTERVAL=1",
			timezone: "Asia/Shanghai",
		});

		expect(parsed.v2ProjectId).toBeUndefined();
		expect(parsed.v2WorkspaceId).toBeUndefined();
	});

	test("rejects non-null workspace context on new automations", () => {
		expect(() =>
			createAutomationSchema.parse({
				name: "Memory report",
				prompt: "Report memory usage.",
				agent: "claude",
				targetHostId: "host-1",
				v2WorkspaceId: "11111111-1111-4111-8111-111111111111",
				rrule: "FREQ=HOURLY;INTERVAL=1",
				timezone: "Asia/Shanghai",
			}),
		).toThrow();
	});

	test("accepts a completed run report with optional structured result", () => {
		const parsed = completeRunSchema.parse({
			runId: RUN_ID,
			resultMarkdown: "# Report\n\nDone.",
			resultJson: { filesChecked: 3 },
			resultSummary: "Daily report completed",
		});

		expect(parsed.resultJson).toEqual({ filesChecked: 3 });
	});

	test("rejects empty completed run reports", () => {
		expect(() =>
			completeRunSchema.parse({
				runId: RUN_ID,
				resultMarkdown: "",
			}),
		).toThrow();
	});

	test("requires a failure reason for failed run writeback", () => {
		expect(() =>
			failRunSchema.parse({
				runId: RUN_ID,
				failureReason: "",
			}),
		).toThrow();
	});

	test("accepts a run reconciliation request", () => {
		expect(reconcileRunSchema.parse({ runId: RUN_ID })).toEqual({
			runId: RUN_ID,
		});
	});
});
