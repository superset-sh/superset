import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { electronTestMock } from "../test-utils/electron-mock";
import { mapEventType } from "./map-event-type";

mock.module("electron", () => electronTestMock);

const {
	consumePendingMainProcessErrors,
	notificationsEmitter,
	reportMainProcessError,
} = await import("./server");

describe("notifications/server", () => {
	beforeEach(() => {
		consumePendingMainProcessErrors();
		notificationsEmitter.removeAllListeners(
			NOTIFICATION_EVENTS.MAIN_PROCESS_ERROR,
		);
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

	describe("main process error reporting", () => {
		it("queues errors when no listeners are attached yet", () => {
			const reported = reportMainProcessError({
				source: "agent-setup",
				message: "Failed to create wrapper",
				error: new Error("EACCES"),
			});

			const queued = consumePendingMainProcessErrors();
			expect(queued).toHaveLength(1);
			expect(queued[0]?.id).toBe(reported.id);
			expect(queued[0]?.message).toBe("Failed to create wrapper");
			expect(queued[0]?.details).toBe("EACCES");
			expect(consumePendingMainProcessErrors()).toEqual([]);
		});

		it("emits immediately and skips queueing when listeners are attached", () => {
			const received = mock(() => {});
			notificationsEmitter.on(NOTIFICATION_EVENTS.MAIN_PROCESS_ERROR, received);

			const reported = reportMainProcessError({
				source: "agent-setup",
				message: "Failed to set up agent hooks",
				error: "permission denied",
			});

			expect(received).toHaveBeenCalledWith(reported);
			expect(consumePendingMainProcessErrors()).toEqual([]);
		});
	});
});
