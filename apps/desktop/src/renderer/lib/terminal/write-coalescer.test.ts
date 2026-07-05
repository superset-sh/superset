import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createWriteCoalescer, MAX_PENDING_BYTES } from "./write-coalescer";

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

describe("createWriteCoalescer", () => {
	test("coalesces chunks arriving in the same frame into one write", () => {
		const writes: Uint8Array[] = [];
		const coalescer = createWriteCoalescer((data) => writes.push(data));

		coalescer.push(bytes("foo"));
		coalescer.push(bytes("bar"));
		coalescer.push(bytes("baz"));
		expect(writes).toHaveLength(0);

		fireFrame();
		expect(writes).toHaveLength(1);
		expect(new TextDecoder().decode(writes[0])).toBe("foobarbaz");
	});

	test("schedules a new frame for data arriving after a flush", () => {
		const writes: Uint8Array[] = [];
		const coalescer = createWriteCoalescer((data) => writes.push(data));

		coalescer.push(bytes("first"));
		fireFrame();
		coalescer.push(bytes("second"));
		fireFrame();

		expect(writes).toHaveLength(2);
		expect(new TextDecoder().decode(writes[1])).toBe("second");
	});

	test("flushSync writes pending bytes immediately and cancels the scheduled frame", () => {
		const writes: Uint8Array[] = [];
		const coalescer = createWriteCoalescer((data) => writes.push(data));

		coalescer.push(bytes("pending"));
		coalescer.flushSync();
		expect(writes).toHaveLength(1);
		expect(new TextDecoder().decode(writes[0])).toBe("pending");

		// The previously scheduled frame must not produce a second write.
		fireFrame();
		expect(writes).toHaveLength(1);
	});

	test("flushSync with nothing pending writes nothing", () => {
		const writes: Uint8Array[] = [];
		const coalescer = createWriteCoalescer((data) => writes.push(data));

		coalescer.flushSync();
		expect(writes).toHaveLength(0);
	});

	test("flushes immediately when pending bytes exceed the cap", () => {
		const writes: Uint8Array[] = [];
		const coalescer = createWriteCoalescer((data) => writes.push(data));

		coalescer.push(new Uint8Array(MAX_PENDING_BYTES + 1));
		expect(writes).toHaveLength(1);
		expect(writes[0]).toHaveLength(MAX_PENDING_BYTES + 1);

		// Nothing left for the frame to write.
		fireFrame();
		expect(writes).toHaveLength(1);
	});

	test("dispose flushes pending bytes and ignores later pushes", () => {
		const writes: Uint8Array[] = [];
		const coalescer = createWriteCoalescer((data) => writes.push(data));

		coalescer.push(bytes("tail"));
		coalescer.dispose();
		expect(writes).toHaveLength(1);
		expect(new TextDecoder().decode(writes[0])).toBe("tail");

		coalescer.push(bytes("ignored"));
		fireFrame();
		expect(writes).toHaveLength(1);
	});

	test("preserves byte order across many small chunks", () => {
		const writes: Uint8Array[] = [];
		const coalescer = createWriteCoalescer((data) => writes.push(data));

		const parts = Array.from({ length: 100 }, (_, i) => `${i},`);
		for (const part of parts) {
			coalescer.push(bytes(part));
		}
		fireFrame();

		expect(writes).toHaveLength(1);
		expect(new TextDecoder().decode(writes[0])).toBe(parts.join(""));
	});
});
