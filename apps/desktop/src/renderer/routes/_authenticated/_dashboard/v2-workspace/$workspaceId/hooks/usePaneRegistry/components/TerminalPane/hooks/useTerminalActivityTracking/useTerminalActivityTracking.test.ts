import { beforeEach, describe, expect, mock, test } from "bun:test";
import { trackTerminalActivity } from "./trackTerminalActivity";

describe("trackTerminalActivity", () => {
	let updateLastActivityAt: ReturnType<typeof mock>;
	const workspaceId = "ws-123";

	beforeEach(() => {
		updateLastActivityAt = mock(() => {});
	});

	test("calls updateLastActivityAt after grace period and debounce", () => {
		const now = Date.now();
		const tracker = trackTerminalActivity(now);

		// Simulate keystroke well past grace period and debounce
		tracker.handleData(
			updateLastActivityAt,
			workspaceId,
			now + 6_000, // past 5s grace period
		);

		expect(updateLastActivityAt).toHaveBeenCalledTimes(1);
		expect(updateLastActivityAt).toHaveBeenCalledWith(workspaceId);
	});

	test("does NOT call updateLastActivityAt during grace period", () => {
		const now = Date.now();
		const tracker = trackTerminalActivity(now);

		// Simulate keystroke within the 5s grace period
		tracker.handleData(
			updateLastActivityAt,
			workspaceId,
			now + 2_000, // within grace period
		);

		expect(updateLastActivityAt).not.toHaveBeenCalled();
	});

	test("debounces rapid keystrokes (only fires once per 30s window)", () => {
		const now = Date.now();
		const tracker = trackTerminalActivity(now);

		// First keystroke past grace period — should fire
		tracker.handleData(updateLastActivityAt, workspaceId, now + 6_000);
		expect(updateLastActivityAt).toHaveBeenCalledTimes(1);

		// Second keystroke at t+16s — 10s after first fire, within 30s debounce
		tracker.handleData(updateLastActivityAt, workspaceId, now + 16_000);
		expect(updateLastActivityAt).toHaveBeenCalledTimes(1);

		// Third keystroke at t+31s — 25s after first fire, still within 30s debounce
		tracker.handleData(updateLastActivityAt, workspaceId, now + 31_000);
		expect(updateLastActivityAt).toHaveBeenCalledTimes(1);

		// Fourth keystroke 37s after first — past the 30s debounce, should fire
		tracker.handleData(updateLastActivityAt, workspaceId, now + 37_000);
		expect(updateLastActivityAt).toHaveBeenCalledTimes(2);
	});

	test("grace period blocks all activity within first 5 seconds", () => {
		const now = Date.now();
		const tracker = trackTerminalActivity(now);

		// Multiple keystrokes within grace period
		tracker.handleData(updateLastActivityAt, workspaceId, now + 1_000);
		tracker.handleData(updateLastActivityAt, workspaceId, now + 2_000);
		tracker.handleData(updateLastActivityAt, workspaceId, now + 3_000);
		tracker.handleData(updateLastActivityAt, workspaceId, now + 4_000);

		expect(updateLastActivityAt).not.toHaveBeenCalled();
	});

	test("fires immediately at grace period boundary", () => {
		const now = Date.now();
		const tracker = trackTerminalActivity(now);

		// Keystroke at exactly 5001ms — just past grace period
		tracker.handleData(updateLastActivityAt, workspaceId, now + 5_001);

		expect(updateLastActivityAt).toHaveBeenCalledTimes(1);
	});
});
