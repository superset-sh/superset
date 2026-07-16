import { describe, expect, test } from "bun:test";
import {
	filterOwnedProcessSignalTargets,
	type ProcessSignalTarget,
} from "../process-tree.ts";
import {
	KillEscalationTimer,
	requireNodePtyWriteStream,
	setAdoptedPtyNonBlocking,
	spawn,
} from "./Pty.ts";

// node-pty's runtime requires Node (Bun's tty.ReadStream handling is
// incompatible with the master fd setup). The daemon ships running under
// node; integration spawn tests live in test/integration.ts and run via
// `npm run test:integration`. Here we only cover the synchronous validation
// logic that doesn't require spawning a real PTY.

describe("Pty wrapper (validation only — spawn behavior tested under node)", () => {
	test("cancelled kill escalation cannot fire after a new timer takes ownership", () => {
		const callbacks: Array<() => void> = [];
		const cleared: NodeJS.Timeout[] = [];
		const timer = new KillEscalationTimer({
			setTimer(callback) {
				callbacks.push(callback);
				return { unref() {} } as NodeJS.Timeout;
			},
			clearTimer(handle) {
				cleared.push(handle);
			},
		});
		const fired: string[] = [];

		timer.schedule(() => fired.push("stale"));
		timer.cancel();
		timer.schedule(() => fired.push("current"));
		callbacks[0]?.();
		expect(fired).toEqual([]);
		callbacks[1]?.();
		expect(fired).toEqual(["current"]);
		expect(cleared).toHaveLength(1);
	});

	test("delayed escalation retains descendants but skips recycled identities", () => {
		const pidTarget: ProcessSignalTarget = {
			target: "pid",
			id: 41,
			witnesses: [{ pid: 41, pgid: 41, startTime: "old-root" }],
		};
		const groupTarget: ProcessSignalTarget = {
			target: "pgid",
			id: 41,
			witnesses: [{ pid: 42, pgid: 41, startTime: "old-child" }],
		};
		const targets = [pidTarget, groupTarget];

		expect(
			filterOwnedProcessSignalTargets(targets, [
				{ pid: 41, ppid: 1, pgid: 41, startTime: "recycled-root" },
				{ pid: 42, ppid: 1, pgid: 41, startTime: "old-child" },
			]),
		).toEqual([groupTarget]);
		expect(
			filterOwnedProcessSignalTargets(targets, [
				{ pid: 41, ppid: 1, pgid: 41, startTime: "recycled-root" },
				{ pid: 42, ppid: 1, pgid: 41, startTime: "recycled-child" },
			]),
		).toEqual([]);
	});

	test("requires the adopted TTY handle nonblocking contract", () => {
		expect(() => setAdoptedPtyNonBlocking({})).toThrow(
			/cannot set nonblocking mode/,
		);
		expect(() =>
			setAdoptedPtyNonBlocking({
				_handle: { setBlocking: () => -22 },
			}),
		).toThrow(/uv error -22/);
	});

	test("requests nonblocking mode and accepts only libuv success", () => {
		const requestedModes: boolean[] = [];
		setAdoptedPtyNonBlocking({
			_handle: {
				setBlocking(blocking: boolean) {
					requestedModes.push(blocking);
					return 0;
				},
			},
		});
		expect(requestedModes).toEqual([false]);
	});

	test("asserts the pinned node-pty CustomWriteStream handoff contract", () => {
		expect(() => requireNodePtyWriteStream({ _fd: 9 })).toThrow(
			/CustomWriteStream contract unavailable/,
		);
		expect(() =>
			requireNodePtyWriteStream({
				_fd: 9,
				_writeStream: {
					_fd: 9,
					_writeQueue: [{ buffer: Buffer.from("x"), offset: 2 }],
					write() {},
				},
			}),
		).toThrow(/queue task contract changed/);

		const writeStream = {
			_fd: 9,
			_writeQueue: [{ buffer: Buffer.from("ok"), offset: 1 }],
			_writeImmediate: undefined,
			write() {},
		};
		expect(
			requireNodePtyWriteStream({ _fd: 9, _writeStream: writeStream }),
		).toBe(writeStream);
	});

	test("rejects invalid spawn dims (cols)", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 0, rows: 24 },
			}),
		).toThrow(/invalid cols/);
	});

	test("rejects invalid spawn dims (rows)", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 0 },
			}),
		).toThrow(/invalid rows/);
	});

	test("rejects non-integer dims", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 80.5, rows: 24 },
			}),
		).toThrow(/invalid cols/);
	});
});
