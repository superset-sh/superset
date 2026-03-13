import { describe, expect, it } from "bun:test";
import { mapEventType } from "./map-event-type";

describe("mapEventType", () => {
	describe("Start events (agent actively processing)", () => {
		it.each([
			"Start",
			"UserPromptSubmit",
			"PostToolUse",
			"PostToolUseFailure",
			"BeforeAgent",
			"AfterTool",
			"sessionStart",
			"userPromptSubmitted",
			"postToolUse",
		])('maps "%s" to "Start"', (eventType) => {
			expect(mapEventType(eventType)).toBe("Start");
		});
	});

	describe("Stop events (agent fully done — all hooks completed)", () => {
		it.each([
			"Stop",
			"agent-turn-complete",
			"sessionEnd",
		])('maps "%s" to "Stop"', (eventType) => {
			expect(mapEventType(eventType)).toBe("Stop");
		});
	});

	describe("PermissionRequest events (agent blocked, user action needed)", () => {
		it.each([
			"PermissionRequest",
			"Notification",
			"preToolUse",
		])('maps "%s" to "PermissionRequest"', (eventType) => {
			expect(mapEventType(eventType)).toBe("PermissionRequest");
		});
	});

	describe("AfterAgent — workspace must stay busy while post-response hooks run", () => {
		/**
		 * Regression test for #2283: When the agent finishes its main response,
		 * Claude Code fires `AfterAgent`. Post-response hooks (e.g. Notification)
		 * continue executing AFTER `AfterAgent` and only complete when `Stop` fires.
		 *
		 * If `AfterAgent` maps to "Stop", the workspace transitions to idle/review
		 * while hooks are still running — giving users a false signal that the
		 * session is complete.
		 *
		 * Fix: `AfterAgent` must map to "Start" so the workspace stays "working"
		 * until the final `Stop` event confirms all hooks have finished.
		 */
		it('maps "AfterAgent" to "Start" to keep workspace busy during post-response hooks', () => {
			expect(mapEventType("AfterAgent")).toBe("Start");
		});
	});

	describe("unknown / empty input", () => {
		it("returns null for undefined", () => {
			expect(mapEventType(undefined)).toBeNull();
		});

		it("returns null for empty string", () => {
			expect(mapEventType("")).toBeNull();
		});

		it("returns null for unknown event types", () => {
			expect(mapEventType("SomeUnknownEvent")).toBeNull();
		});
	});
});
