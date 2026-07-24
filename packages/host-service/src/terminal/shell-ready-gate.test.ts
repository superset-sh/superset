import { describe, expect, it } from "bun:test";
import {
	createShellReadyGate,
	SHELL_READY_FALLBACK_TIMEOUT_MS,
} from "./shell-ready-gate";

/**
 * A controllable stand-in for setTimeout/clearTimeout so tests can decide
 * exactly when (and whether) the fallback fires — no real waiting.
 */
function makeFakeTimer() {
	let nextId = 1;
	const pending = new Map<number, () => void>();
	return {
		setTimer: (callback: () => void) => {
			const id = nextId++;
			pending.set(id, callback);
			return id;
		},
		clearTimer: (handle: unknown) => {
			pending.delete(handle as number);
		},
		/** Fire every scheduled-but-not-cleared callback. */
		flush() {
			for (const [id, callback] of [...pending]) {
				pending.delete(id);
				callback();
			}
		},
		get scheduledCount() {
			return pending.size;
		},
	};
}

/**
 * Mirrors host-service `queueInitialCommand`: a preset/agent launch queues its
 * command and only writes it to the PTY once the readiness gate resolves and
 * the session was not cancelled.
 */
function queueInitialCommand(
	gate: ReturnType<typeof createShellReadyGate>,
	write: () => void,
): Promise<void> {
	return gate.promise.then(() => {
		if (gate.getState() !== "cancelled") write();
	});
}

describe("shell-ready gate", () => {
	// Regression for #5879: terminal presets open a new terminal but the command
	// never runs. The queued command waits on the readiness gate, which only
	// resolved on the OSC 133;A marker or session teardown. When a shell's launch
	// config claims to emit the marker but never does, the gate stayed pending
	// forever and the command was silently dropped.
	it("reproduces the hang: no marker + no fallback never runs the command", async () => {
		const gate = createShellReadyGate({
			supportsMarker: true,
			// fallbackTimeoutMs: 0 models the original behaviour, which had no
			// fallback at all.
			fallbackTimeoutMs: 0,
		});

		let ran = false;
		void queueInitialCommand(gate, () => {
			ran = true;
		});

		// Give any microtasks a chance to flush; the marker never arrives.
		await Promise.resolve();
		await Promise.resolve();

		expect(gate.getState()).toBe("pending");
		expect(ran).toBe(false);
	});

	it("runs the queued command via the fallback when the marker never arrives", async () => {
		const timer = makeFakeTimer();
		const gate = createShellReadyGate({
			supportsMarker: true,
			setTimer: timer.setTimer,
			clearTimer: timer.clearTimer,
		});

		let ran = false;
		const queued = queueInitialCommand(gate, () => {
			ran = true;
		});

		expect(gate.getState()).toBe("pending");
		expect(ran).toBe(false);

		// Marker never showed up — the fallback fires instead.
		timer.flush();
		await queued;

		expect(gate.getState()).toBe("ready");
		expect(ran).toBe(true);
	});

	it("runs the queued command as soon as the marker arrives, cancelling the fallback", async () => {
		const timer = makeFakeTimer();
		const gate = createShellReadyGate({
			supportsMarker: true,
			setTimer: timer.setTimer,
			clearTimer: timer.clearTimer,
		});

		let ran = false;
		const queued = queueInitialCommand(gate, () => {
			ran = true;
		});

		gate.markReady();
		await queued;

		expect(gate.getState()).toBe("ready");
		expect(ran).toBe(true);
		// The fallback timer must be torn down so it can't re-fire on a live shell.
		expect(timer.scheduledCount).toBe(0);
	});

	it("does not run the command when the session is cancelled before readiness", async () => {
		const timer = makeFakeTimer();
		const gate = createShellReadyGate({
			supportsMarker: true,
			setTimer: timer.setTimer,
			clearTimer: timer.clearTimer,
		});

		let ran = false;
		const queued = queueInitialCommand(gate, () => {
			ran = true;
		});

		gate.cancel();
		await queued;

		expect(gate.getState()).toBe("cancelled");
		expect(ran).toBe(false);
		expect(timer.scheduledCount).toBe(0);
	});

	it("resolves immediately for unsupported shells (no marker expected)", async () => {
		const gate = createShellReadyGate({ supportsMarker: false });
		expect(gate.getState()).toBe("unsupported");

		let ran = false;
		await queueInitialCommand(gate, () => {
			ran = true;
		});
		expect(ran).toBe(true);
	});

	it("resolves immediately for adopted shells that already ran startup", async () => {
		const gate = createShellReadyGate({
			supportsMarker: false,
			isAdopted: true,
		});
		expect(gate.getState()).toBe("ready");

		let ran = false;
		await queueInitialCommand(gate, () => {
			ran = true;
		});
		expect(ran).toBe(true);
	});

	it("schedules the fallback with the documented default delay", () => {
		const scheduled: number[] = [];
		createShellReadyGate({
			supportsMarker: true,
			setTimer: (_callback, ms) => {
				scheduled.push(ms);
				return 1;
			},
			clearTimer: () => {},
		});
		expect(scheduled).toEqual([SHELL_READY_FALLBACK_TIMEOUT_MS]);
	});
});
