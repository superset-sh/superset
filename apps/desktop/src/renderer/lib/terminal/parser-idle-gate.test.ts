import { describe, expect, test } from "bun:test";
import {
	cancelParserIdleWork,
	createParserIdleGate,
	runWhenParserIdle,
	wrapWrite,
} from "./parser-idle-gate";

// Stand in for xterm's write: holds each write's callback instead of firing it,
// mirroring how xterm holds a write's callback until that chunk (and any async
// parser handler it triggered) has fully parsed. `drain()` fires the queued
// callbacks, simulating the parser returning to GROUND.
function fakeWrite() {
	const pending: Array<() => void> = [];
	const raw = (_data: string | Uint8Array, cb?: () => void) => {
		if (cb) pending.push(cb);
	};
	return {
		raw,
		hasPending: () => pending.length > 0,
		drain() {
			const cbs = pending.splice(0, pending.length);
			for (const cb of cbs) cb();
		},
	};
}

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

describe("runWhenParserIdle", () => {
	test("runs synchronously when no writes are in flight", () => {
		const gate = createParserIdleGate();
		let ran = false;
		runWhenParserIdle(gate, () => {
			ran = true;
		});
		expect(ran).toBe(true);
	});

	test("defers until in-flight writes drain (parser back in GROUND)", async () => {
		const gate = createParserIdleGate();
		const fake = fakeWrite();
		const write = wrapWrite(gate, fake.raw);

		// An inline-image write is mid-decode: its callback hasn't fired yet, so
		// the parser is paused. Resizing now would re-enter parse and throw.
		write("\x1b]1337;image-data\x07");
		expect(fake.hasPending()).toBe(true);

		let ran = false;
		runWhenParserIdle(gate, () => {
			ran = true;
		});

		// Must NOT run while the async write is still pending.
		await flushMicrotasks();
		expect(ran).toBe(false);

		// Parser drains → the parked work runs (after the settling microtask).
		fake.drain();
		await flushMicrotasks();
		expect(ran).toBe(true);
	});

	test("runs the parked work exactly once", async () => {
		const gate = createParserIdleGate();
		const fake = fakeWrite();
		const write = wrapWrite(gate, fake.raw);
		write("img");

		let runs = 0;
		runWhenParserIdle(gate, () => {
			runs++;
		});

		fake.drain();
		await flushMicrotasks();
		await flushMicrotasks();
		expect(runs).toBe(1);
	});

	test("coalesces resizes parked during the same busy window", async () => {
		const gate = createParserIdleGate();
		const fake = fakeWrite();
		const write = wrapWrite(gate, fake.raw);
		write("img");

		const ran: string[] = [];
		runWhenParserIdle(gate, () => ran.push("first"));
		runWhenParserIdle(gate, () => ran.push("second"));

		fake.drain();
		await flushMicrotasks();
		await flushMicrotasks();
		// Only the latest fit-to-container matters; the earlier one is superseded.
		expect(ran).toEqual(["second"]);
	});

	test("keeps the gate closed until the write callback unwinds", async () => {
		const gate = createParserIdleGate();
		const fake = fakeWrite();
		const write = wrapWrite(gate, fake.raw);

		const ran: string[] = [];
		write("first", () => {
			runWhenParserIdle(gate, () => ran.push("idle"));
			write("second");
		});

		fake.drain();
		await flushMicrotasks();
		expect(ran).toEqual([]);
		expect(fake.hasPending()).toBe(true);

		fake.drain();
		await flushMicrotasks();
		expect(ran).toEqual(["idle"]);
	});

	test("re-parks when a write lands between drain and the microtask flush", async () => {
		const gate = createParserIdleGate();
		const fake = fakeWrite();
		const write = wrapWrite(gate, fake.raw);
		write("first");

		let runs = 0;
		runWhenParserIdle(gate, () => {
			runs++;
		});

		// First write drains (queuing the flush microtask), but a new write
		// arrives before that microtask runs — the flush must bail and re-arm.
		fake.drain();
		write("second");
		await flushMicrotasks();
		expect(runs).toBe(0);

		fake.drain();
		await flushMicrotasks();
		expect(runs).toBe(1);
	});

	test("cancels parked work before in-flight writes drain", async () => {
		const gate = createParserIdleGate();
		const fake = fakeWrite();
		const write = wrapWrite(gate, fake.raw);
		write("img");

		let ran = false;
		runWhenParserIdle(gate, () => {
			ran = true;
		});

		cancelParserIdleWork(gate);
		fake.drain();
		await flushMicrotasks();
		await flushMicrotasks();
		expect(ran).toBe(false);
	});

	test("preserves the caller's own write callback", () => {
		const gate = createParserIdleGate();
		const fake = fakeWrite();
		const write = wrapWrite(gate, fake.raw);

		let called = false;
		write("data", () => {
			called = true;
		});
		fake.drain();
		expect(called).toBe(true);
	});
});
