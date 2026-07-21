import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
	GROK_PERMISSION_DEBOUNCE_MS,
	type GrokLifecycleEventType,
	GrokLifecycleInterpreter,
} from "./grok-lifecycle";

describe("GrokLifecycleInterpreter", () => {
	let interpreter: GrokLifecycleInterpreter;
	let events: GrokLifecycleEventType[];

	beforeEach(() => {
		jest.useFakeTimers();
		interpreter = new GrokLifecycleInterpreter();
		events = [];
	});

	afterEach(() => {
		interpreter.dispose();
		jest.useRealTimers();
	});

	function handle(
		eventType: string,
		notificationType?: string,
		sessionId = "session-1",
	): boolean {
		return interpreter.handle(
			{ key: "terminal-1", eventType, notificationType, sessionId },
			(event) => events.push(event),
		);
	}

	test("maps session, turn, and failure events", () => {
		expect(handle("session_start")).toBe(true);
		expect(handle("user_prompt_submit")).toBe(true);
		expect(handle("post_tool_use")).toBe(true);
		expect(handle("stop")).toBe(true);
		expect(handle("stop_failure")).toBe(true);
		expect(handle("session_end")).toBe(true);

		expect(events).toEqual([
			"Attached",
			"Start",
			"Start",
			"Stop",
			"Failed",
			"Detached",
		]);
	});

	test("accepts the documented PascalCase event names", () => {
		handle("SessionStart");
		handle("UserPromptSubmit");
		handle("PostToolUseFailure");
		handle("StopFailure");

		expect(events).toEqual(["Attached", "Start", "Start", "Failed"]);
	});

	test("suppresses an automatically resolved permission candidate", () => {
		handle("session_start");
		handle("user_prompt_submit");
		events = [];

		handle("notification", "permission_prompt");
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS - 1);
		expect(events).toEqual([]);

		handle("post_tool_use");
		jest.advanceTimersByTime(1);
		expect(events).toEqual(["Start"]);
	});

	test("exposes a permission request when the candidate remains unresolved", () => {
		handle("session_start");
		handle("user_prompt_submit");
		events = [];

		handle("notification", "permission_prompt");
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);
		expect(events).toEqual(["PermissionRequest"]);

		handle("post_tool_use");
		expect(events).toEqual(["PermissionRequest", "Start"]);
	});

	test("clears an exposed permission when the user denies it", () => {
		handle("session_start");
		handle("user_prompt_submit");
		events = [];
		handle("notification", "permission_prompt");
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);

		handle("permission_denied");
		handle("stop");
		expect(events).toEqual(["PermissionRequest", "Start", "Stop"]);
	});

	test("does not emit a transition for a quickly denied candidate", () => {
		handle("session_start");
		handle("user_prompt_submit");
		events = [];
		handle("notification", "permission_prompt");
		handle("permission_denied");
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);

		expect(events).toEqual([]);
	});

	test("ignores non-permission notifications", () => {
		handle("session_start");
		handle("user_prompt_submit");
		events = [];

		expect(handle("notification", "informational")).toBe(true);
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);
		expect(events).toEqual([]);
	});

	test("does not restart a completed turn for a late tool event", () => {
		handle("session_start");
		handle("user_prompt_submit");
		handle("stop");
		events = [];

		handle("post_tool_use");
		expect(events).toEqual([]);
	});

	test("replacing the session cancels its pending permission", () => {
		handle("session_start");
		handle("user_prompt_submit");
		handle("notification", "permission_prompt");
		events = [];

		handle("session_start", undefined, "session-2");
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);
		expect(events).toEqual(["Attached"]);
	});

	test("clear and dispose cancel pending permission timers", () => {
		handle("session_start");
		handle("user_prompt_submit");
		handle("notification", "permission_prompt");
		events = [];
		interpreter.clear("terminal-1");
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);
		expect(events).toEqual([]);

		handle("session_start");
		handle("user_prompt_submit");
		handle("notification", "permission_prompt");
		interpreter.dispose();
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);
		expect(events).toEqual(["Attached", "Start"]);
	});

	test("returns false for events outside the Superset lifecycle contract", () => {
		expect(handle("subagent_start")).toBe(false);
		expect(events).toEqual([]);
	});
});
