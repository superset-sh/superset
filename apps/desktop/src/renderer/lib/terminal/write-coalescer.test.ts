import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	createWriteCoalescer,
	MAX_BACKLOG_BYTES,
	MAX_PENDING_BYTES,
} from "./write-coalescer";

// Capture rAF callbacks so tests control frame timing deterministically.
let frameCallbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;

const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;

function fireFrame() {
	const callbacks = [...frameCallbacks.values()];
	frameCallbacks.clear();
	for (const callback of callbacks) {
		callback(performance.now());
	}
}

beforeEach(() => {
	frameCallbacks = new Map();
	nextFrameId = 1;
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
		const id = nextFrameId++;
		frameCallbacks.set(id, callback);
		return id;
	};
	globalThis.cancelAnimationFrame = (id: number) => {
		frameCallbacks.delete(id);
	};
});

afterEach(() => {
	globalThis.requestAnimationFrame = originalRaf;
	globalThis.cancelAnimationFrame = originalCancelRaf;
});

function bytes(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

// Stands in for xterm: records each batch and holds its completion callback
// until the test says the parser caught up, the way xterm holds it until the
// chunk has parsed.
function fakeTerminal() {
	const writes: Uint8Array[] = [];
	const callbacks: Array<() => void> = [];
	return {
		writes,
		write(data: Uint8Array, done: () => void) {
			writes.push(data);
			callbacks.push(done);
		},
		text: () => writes.map((w) => new TextDecoder().decode(w)),
		/** Report every outstanding batch parsed, then settle the microtasks. */
		async drain() {
			for (const done of callbacks.splice(0, callbacks.length)) done();
			await Promise.resolve();
		},
	};
}

describe("createWriteCoalescer", () => {
	test("coalesces chunks arriving in the same frame into one write", () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("foo"));
		coalescer.push(bytes("bar"));
		coalescer.push(bytes("baz"));
		expect(term.writes).toHaveLength(0);

		fireFrame();
		expect(term.text()).toEqual(["foobarbaz"]);
	});

	test("schedules a new frame for data arriving after a flush", async () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("first"));
		fireFrame();
		await term.drain();
		coalescer.push(bytes("second"));
		fireFrame();

		expect(term.text()).toEqual(["first", "second"]);
	});

	test("flushSync writes pending bytes immediately and cancels the scheduled frame", () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("pending"));
		coalescer.flushSync();
		expect(term.text()).toEqual(["pending"]);

		// The previously scheduled frame must not produce a second write.
		fireFrame();
		expect(term.writes).toHaveLength(1);
	});

	test("flushSync with nothing pending writes nothing", () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.flushSync();
		expect(term.writes).toHaveLength(0);
	});

	test("flushes immediately when pending bytes exceed the cap", () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(new Uint8Array(MAX_PENDING_BYTES + 1));
		expect(term.writes).toHaveLength(1);
		expect(term.writes[0]).toHaveLength(MAX_PENDING_BYTES + 1);

		// Nothing left for the frame to write.
		fireFrame();
		expect(term.writes).toHaveLength(1);
	});

	test("dispose flushes pending bytes and ignores later pushes", () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("tail"));
		coalescer.dispose();
		expect(term.text()).toEqual(["tail"]);

		coalescer.push(bytes("ignored"));
		fireFrame();
		expect(term.writes).toHaveLength(1);
	});

	test("preserves byte order across many small chunks", () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		const parts = Array.from({ length: 100 }, (_, i) => `${i},`);
		for (const part of parts) {
			coalescer.push(bytes(part));
		}
		fireFrame();

		expect(term.text()).toEqual([parts.join("")]);
	});

	test("holds the next batch until the terminal reports the last one parsed", async () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("first"));
		fireFrame();
		expect(term.text()).toEqual(["first"]);

		// Terminal has not called back yet: frames keep passing, nothing more
		// is handed over, and nothing is dropped.
		coalescer.push(bytes("second"));
		fireFrame();
		fireFrame();
		expect(term.text()).toEqual(["first"]);

		await term.drain();
		fireFrame();
		expect(term.text()).toEqual(["first", "second"]);
	});

	test("never exceeds the cap in the terminal while it is behind", async () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("first"));
		fireFrame();

		// A burst far past the cap arrives while the terminal is still parsing.
		// Pre-back-pressure this flushed on every cap crossing, piling unparsed
		// data up inside the terminal until it threw the batch away.
		for (let i = 0; i < 8; i++) {
			coalescer.push(new Uint8Array(MAX_PENDING_BYTES));
		}
		expect(term.writes).toHaveLength(1);

		// Draining hands the whole backlog over at once, without waiting for a
		// frame — the terminal is behind, so idling would only widen the gap.
		await term.drain();
		expect(term.writes).toHaveLength(2);
		expect(term.writes[1]).toHaveLength(8 * MAX_PENDING_BYTES);
	});

	test("flushSync still orders other writers behind pending bytes mid-parse", () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("first"));
		fireFrame();
		coalescer.push(bytes("second"));

		// An exit notice needs the PTY bytes in the terminal first, even though
		// the previous batch has not parsed yet.
		coalescer.flushSync();
		expect(term.text()).toEqual(["first", "second"]);
	});

	test("bounds its own queue when the parser never reports a parse", async () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("head"));
		fireFrame();
		expect(term.writes).toHaveLength(1);

		// The parser has not called back and never will (a throttled background
		// renderer parses in ~12ms slices per second; a hung async parser
		// handler never resumes at all). Everything below piles into the
		// coalescer's own queue, which is where the emulator's bounded pile
		// moved to when back-pressure was added.
		coalescer.push(bytes("OLDEST"));
		for (let i = 0; i < 24; i++) {
			coalescer.push(new Uint8Array(1024 * 1024));
		}
		coalescer.push(bytes("NEWEST"));

		await term.drain();
		const batch = term.writes[1] as Uint8Array;

		// 25 MB went in; the queue held its ceiling, plus the notice it prepends.
		expect(batch.length).toBeLessThanOrEqual(MAX_BACKLOG_BYTES + 256);

		// Dropped from the head, so the newest bytes — the ones that decide what
		// the pane ends up showing — survived.
		const tail = new TextDecoder().decode(batch.subarray(batch.length - 6));
		expect(tail).toBe("NEWEST");

		// ...and the pane is told it happened, at the point it happened.
		const head = new TextDecoder().decode(batch.subarray(0, 96));
		expect(head).toContain("[terminal] dropped output");
	});

	test("reports an overflow episode once, not once per flush", async () => {
		const term = fakeTerminal();
		const coalescer = createWriteCoalescer(term.write);

		coalescer.push(bytes("head"));
		fireFrame();

		const notices = () =>
			term.writes.filter((w) =>
				new TextDecoder()
					.decode(w.subarray(0, 96))
					.includes("[terminal] dropped output"),
			).length;

		// Three separate drains, all while the backlog stays over the ceiling.
		for (let round = 0; round < 3; round++) {
			for (let i = 0; i < 12; i++) {
				coalescer.push(new Uint8Array(1024 * 1024));
			}
			await term.drain();
		}
		expect(notices()).toBe(1);

		// The burst ends and the queue drains; a later one is a new episode.
		await term.drain();
		coalescer.push(bytes("quiet"));
		fireFrame();
		await term.drain();
		for (let i = 0; i < 12; i++) {
			coalescer.push(new Uint8Array(1024 * 1024));
		}
		await term.drain();
		expect(notices()).toBe(2);
	});

	test("a throwing write does not wedge the coalescer", () => {
		const writes: string[] = [];
		let fail = true;
		const coalescer = createWriteCoalescer((data) => {
			if (fail) throw new Error("write data discarded, use flow control");
			writes.push(new TextDecoder().decode(data));
		});

		coalescer.push(bytes("discarded"));
		expect(() => coalescer.flushSync()).toThrow("write data discarded");

		// The failed write must not leave the coalescer believing a batch is
		// still in flight, or the pane would never render again.
		fail = false;
		coalescer.push(bytes("after"));
		fireFrame();
		expect(writes).toEqual(["after"]);
	});
});
