import { describe, expect, it } from "bun:test";
import {
	createInitialTerminalSessionState,
	reduceTerminalSessionState,
} from "./terminalSessionState";

describe("reduceTerminalSessionState", () => {
	it("resets session state when an attach starts", () => {
		const initial = {
			...createInitialTerminalSessionState(),
			exitStatus: "exited" as const,
			connectionError: "lost",
			isRestoredMode: true,
			restoredCwd: "/tmp",
			isStreamReady: true,
			isExited: true,
			wasKilledByUser: true,
			hasReceivedStreamDataSinceAttach: true,
		};

		const next = reduceTerminalSessionState(initial, {
			type: "ATTACH_STARTED",
		});

		expect(next.phase).toBe("attaching");
		expect(next.exitStatus).toBeNull();
		expect(next.connectionError).toBeNull();
		expect(next.isRestoredMode).toBe(false);
		expect(next.restoredCwd).toBeNull();
		expect(next.isStreamReady).toBe(false);
		expect(next.isExited).toBe(false);
		expect(next.wasKilledByUser).toBe(false);
		expect(next.hasReceivedStreamDataSinceAttach).toBe(false);
	});

	it("moves to live after stream becomes ready and data arrives", () => {
		const attached = reduceTerminalSessionState(
			createInitialTerminalSessionState(),
			{ type: "ATTACH_STARTED" },
		);
		const ready = reduceTerminalSessionState(attached, {
			type: "STREAM_READY_CHANGED",
			ready: true,
		});
		const live = reduceTerminalSessionState(ready, {
			type: "STREAM_DATA_RECEIVED",
		});

		expect(ready.phase).toBe("live");
		expect(live.phase).toBe("live");
		expect(live.hasReceivedStreamDataSinceAttach).toBe(true);
	});

	it("does not allocate new state for repeated stream data after the first chunk", () => {
		const firstChunk = reduceTerminalSessionState(
			createInitialTerminalSessionState(),
			{ type: "STREAM_DATA_RECEIVED" },
		);
		const secondChunk = reduceTerminalSessionState(firstChunk, {
			type: "STREAM_DATA_RECEIVED",
		});

		expect(secondChunk).toBe(firstChunk);
	});

	it("records killed exits distinctly from normal exits", () => {
		const attached = reduceTerminalSessionState(
			createInitialTerminalSessionState(),
			{ type: "ATTACH_STARTED" },
		);
		const killed = reduceTerminalSessionState(attached, {
			type: "EXIT_RECORDED",
			reason: "killed",
		});
		const exited = reduceTerminalSessionState(attached, {
			type: "EXIT_RECORDED",
		});

		expect(killed.phase).toBe("killed");
		expect(killed.exitStatus).toBe("killed");
		expect(killed.wasKilledByUser).toBe(true);
		expect(exited.phase).toBe("exited");
		expect(exited.exitStatus).toBe("exited");
		expect(exited.wasKilledByUser).toBe(false);
	});

	it("prioritizes restored mode and connection errors in the derived phase", () => {
		const restored = reduceTerminalSessionState(
			createInitialTerminalSessionState(),
			{ type: "RESTORED_MODE_ENTERED", cwd: "/repo" },
		);
		const errored = reduceTerminalSessionState(restored, {
			type: "CONNECTION_ERROR_CHANGED",
			error: "Connection lost",
		});

		expect(restored.phase).toBe("restored");
		expect(errored.phase).toBe("connection_error");
		expect(errored.isRestoredMode).toBe(true);
	});
});
