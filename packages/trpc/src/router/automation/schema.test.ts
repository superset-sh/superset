import { describe, expect, test } from "bun:test";
import { completeRunSchema, failRunSchema } from "./schema";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

describe("automation run writeback schemas", () => {
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
});
