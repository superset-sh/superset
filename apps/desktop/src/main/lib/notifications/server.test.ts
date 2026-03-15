import { describe, expect, it } from "bun:test";
import { DEFAULT_AGENT_STATUS_INDICATORS } from "shared/constants";
import { mapEventType } from "./map-event-type";

describe("notifications/server", () => {
	describe("agent status indicators default", () => {
		it("defaults to enabled so existing users are not affected", () => {
			expect(DEFAULT_AGENT_STATUS_INDICATORS).toBe(true);
		});
	});

	describe("PostToolUse frequency (issue #2411)", () => {
		const frequentEvents = [
			"PostToolUse",
			"PostToolUseFailure",
			"AfterTool",
			"postToolUse",
		];

		it("maps all per-tool-use events to 'Start', which fires on every tool call", () => {
			for (const event of frequentEvents) {
				expect(mapEventType(event)).toBe("Start");
			}
		});

		it("has no built-in throttling — each call produces a mapped event", () => {
			// Simulate 50 rapid PostToolUse events (typical in a single agent session)
			const results = Array.from({ length: 50 }, () =>
				mapEventType("PostToolUse"),
			);
			// Every single one maps to "Start" with no deduplication
			expect(results.every((r) => r === "Start")).toBe(true);
			expect(results.length).toBe(50);
		});
	});

	describe("mapEventType", () => {
		it("should map 'Start' to 'Start'", () => {
			expect(mapEventType("Start")).toBe("Start");
		});

		it("should map 'UserPromptSubmit' to 'Start'", () => {
			expect(mapEventType("UserPromptSubmit")).toBe("Start");
		});

		it("should map 'Stop' to 'Stop'", () => {
			expect(mapEventType("Stop")).toBe("Stop");
		});

		it("should map 'agent-turn-complete' to 'Stop'", () => {
			expect(mapEventType("agent-turn-complete")).toBe("Stop");
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
