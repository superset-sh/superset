import { describe, expect, it } from "bun:test";
import { mapEventType } from "./map-event-type";
import { resolvePaneId } from "./resolve-pane-id";

describe("notifications/server", () => {
	describe("resolvePaneId", () => {
		it("returns an explicit paneId even when app state is not initialized", () => {
			expect(resolvePaneId("pane-1", "tab-1", "ws-1", "session-1")).toBe(
				"pane-1",
			);
		});
	});

	describe("mapEventType", () => {
		it("should map 'Start' to 'Start'", () => {
			expect(mapEventType("Start")).toBe("Start");
		});

		// Repro for #4751: SessionStart fires on Claude Code boot when the agent
		// is still idle. Treating it as "Start" flips the pane to "working",
		// overwriting any existing notification badge with the amber spinner.
		it("should not map session-boot events to 'Start' (repro #4751)", () => {
			expect(mapEventType("SessionStart")).not.toBe("Start");
			expect(mapEventType("sessionStart")).not.toBe("Start");
			expect(mapEventType("session_start")).not.toBe("Start");
		});

		// SessionEnd is a session-lifetime signal, not a turn-complete signal.
		// Mapping it to "Stop" would falsely mark the pane as "ready for review".
		it("should not map session-end events to 'Stop' (repro #4751)", () => {
			expect(mapEventType("SessionEnd")).not.toBe("Stop");
			expect(mapEventType("sessionEnd")).not.toBe("Stop");
			expect(mapEventType("session_end")).not.toBe("Stop");
		});

		it("should map 'UserPromptSubmit' to 'Start'", () => {
			expect(mapEventType("UserPromptSubmit")).toBe("Start");
		});

		it("should map Codex snake_case start events to 'Start'", () => {
			expect(mapEventType("user_prompt_submit")).toBe("Start");
			expect(mapEventType("post_tool_use")).toBe("Start");
			expect(mapEventType("task_started")).toBe("Start");
		});

		it("should map 'Stop' to 'Stop'", () => {
			expect(mapEventType("Stop")).toBe("Stop");
		});

		it("should map 'agent-turn-complete' to 'Stop'", () => {
			expect(mapEventType("agent-turn-complete")).toBe("Stop");
		});

		it("should map Codex native stop events to 'Stop'", () => {
			expect(mapEventType("stop")).toBe("Stop");
			expect(mapEventType("task_complete")).toBe("Stop");
		});

		it("should map 'PostToolUse' to 'Start'", () => {
			expect(mapEventType("PostToolUse")).toBe("Start");
		});

		it("should map 'PostToolUseFailure' to 'Start'", () => {
			expect(mapEventType("PostToolUseFailure")).toBe("Start");
		});

		it("should map Gemini 'BeforeAgent' to 'Start'", () => {
			expect(mapEventType("BeforeAgent")).toBe("Start");
		});

		it("should map Gemini 'AfterAgent' to 'Stop'", () => {
			expect(mapEventType("AfterAgent")).toBe("Stop");
		});

		it("should map Gemini 'AfterTool' to 'Start'", () => {
			expect(mapEventType("AfterTool")).toBe("Start");
		});

		it("should map 'PermissionRequest' to 'PermissionRequest'", () => {
			expect(mapEventType("PermissionRequest")).toBe("PermissionRequest");
		});

		it("should map Codex tool approval events to 'PermissionRequest'", () => {
			expect(mapEventType("PreToolUse")).toBe("PermissionRequest");
			expect(mapEventType("pre_tool_use")).toBe("PermissionRequest");
			expect(mapEventType("exec_approval_request")).toBe("PermissionRequest");
			expect(mapEventType("apply_patch_approval_request")).toBe(
				"PermissionRequest",
			);
			expect(mapEventType("request_user_input")).toBe("PermissionRequest");
		});

		it("should map Factory Droid 'Notification' to 'PermissionRequest'", () => {
			expect(mapEventType("Notification")).toBe("PermissionRequest");
		});

		it("should return null for unknown event types (forward compatibility)", () => {
			expect(mapEventType("UnknownEvent")).toBeNull();
			expect(mapEventType("FutureEvent")).toBeNull();
			expect(mapEventType("SomeNewHook")).toBeNull();
		});

		it("should return null for undefined eventType (not default to Stop)", () => {
			expect(mapEventType(undefined)).toBeNull();
		});

		it("should return null for empty string eventType", () => {
			expect(mapEventType("")).toBeNull();
		});
	});
});
