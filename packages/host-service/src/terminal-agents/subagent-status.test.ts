import { describe, expect, it } from "bun:test";
import { getSubagentHarness } from "./subagent-harnesses";
import { deriveSubagentStatus } from "./subagent-status";

describe("deriveSubagentStatus", () => {
	const harness = getSubagentHarness("claude");

	it("maps a start or tool event to working", () => {
		expect(deriveSubagentStatus("SubagentStart", harness)).toBe("working");
		expect(deriveSubagentStatus("PreToolUse", harness)).toBe("working");
		expect(deriveSubagentStatus("PostToolUse", harness)).toBe("working");
		expect(deriveSubagentStatus("UserPromptSubmit", harness)).toBe("working");
	});

	it("maps a permission request or notification to waiting", () => {
		expect(deriveSubagentStatus("PermissionRequest", harness)).toBe("waiting");
		expect(deriveSubagentStatus("Notification", harness)).toBe("waiting");
	});

	it("maps the harness's stop events to completed", () => {
		expect(deriveSubagentStatus("SubagentStop", harness)).toBe("completed");
		expect(deriveSubagentStatus("Stop", harness)).toBe("completed");
		expect(
			deriveSubagentStatus("SubagentStop", {
				isStopEvent: (eventType) => eventType === "Finished",
			}),
		).toBe("working");
		expect(
			deriveSubagentStatus("Finished", {
				isStopEvent: (eventType) => eventType === "Finished",
			}),
		).toBe("completed");
	});
});
