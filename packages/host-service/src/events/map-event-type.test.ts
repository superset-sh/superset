import { describe, expect, it } from "bun:test";
import { mapEventType } from "./map-event-type";

describe("mapEventType", () => {
	it("routes session lifecycle to Attached/Detached, not Start/Stop", () => {
		expect(mapEventType("SessionStart")).toBe("Attached");
		expect(mapEventType("attached")).toBe("Attached");
		expect(mapEventType("sessionStart")).toBe("Attached");
		expect(mapEventType("session_start")).toBe("Attached");

		expect(mapEventType("SessionEnd")).toBe("Detached");
		expect(mapEventType("detached")).toBe("Detached");
		expect(mapEventType("sessionEnd")).toBe("Detached");
		expect(mapEventType("session_end")).toBe("Detached");
	});

	it("routes per-turn cadence to Start/Stop", () => {
		expect(mapEventType("UserPromptSubmit")).toBe("Start");
		expect(mapEventType("BeforeAgent")).toBe("Start");
		expect(mapEventType("PostToolUse")).toBe("Start");
		expect(mapEventType("task_started")).toBe("Start");

		expect(mapEventType("Stop")).toBe("Stop");
		expect(mapEventType("AfterAgent")).toBe("Stop");
		expect(mapEventType("task_complete")).toBe("Stop");
		expect(mapEventType("agent-turn-complete")).toBe("Stop");
	});

	it("routes permission events", () => {
		expect(mapEventType("PermissionRequest")).toBe("PermissionRequest");
		expect(mapEventType("Notification")).toBe("PermissionRequest");
		expect(mapEventType("PreToolUse")).toBe("PermissionRequest");
		expect(mapEventType("exec_approval_request")).toBe("PermissionRequest");
	});

	it("returns null for missing or unknown events", () => {
		expect(mapEventType(undefined)).toBeNull();
		expect(mapEventType("")).toBeNull();
		expect(mapEventType("totally-made-up")).toBeNull();
	});
});
