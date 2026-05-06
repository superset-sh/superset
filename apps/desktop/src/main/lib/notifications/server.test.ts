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

		it("should map 'SessionStart' to 'Start'", () => {
			expect(mapEventType("SessionStart")).toBe("Start");
		});

		it("should map 'UserPromptSubmit' to 'Start'", () => {
			expect(mapEventType("UserPromptSubmit")).toBe("Start");
		});

		it("should map Codex snake_case start events to 'Start'", () => {
			expect(mapEventType("session_start")).toBe("Start");
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
