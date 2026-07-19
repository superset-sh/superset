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

	it("routes failure events to Failed, distinct from Stop", () => {
		expect(mapEventType("StopFailure")).toBe("Failed");
		expect(mapEventType("stop_failure")).toBe("Failed");
		expect(mapEventType("Failed")).toBe("Failed");
		expect(mapEventType("Stop")).toBe("Stop");
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

	it("maps Vibe hook events", () => {
		expect(mapEventType("before_tool")).toBe("Start");
		expect(mapEventType("post_agent_turn")).toBe("Stop");
	});

	it("maps Kimi hook events that extend the shared lifecycle set", () => {
		expect(mapEventType("PermissionResult")).toBe("Start");
		expect(mapEventType("Interrupt")).toBe("Stop");
	});
});
