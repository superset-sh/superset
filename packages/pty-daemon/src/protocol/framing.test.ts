import { describe, expect, test } from "bun:test";
import { decodeFrame, encodeFrame, FrameDecoder } from "./framing.ts";

describe("framing — JSON-only frames", () => {
	test("round-trips a simple object with no payload", () => {
		const msg = { type: "hello", protocols: [2] };
		const frame = encodeFrame(msg);
		expect(decodeFrame(frame)).toEqual({ message: msg, payload: null });
	});

	test("round-trips through FrameDecoder", () => {
		const a = { type: "open", id: "s0" };
		const b = { type: "close", id: "s0" };
		const dec = new FrameDecoder();
		dec.push(Buffer.concat([encodeFrame(a), encodeFrame(b)]));
		expect(dec.drain()).toEqual([
			{ message: a, payload: null },
			{ message: b, payload: null },
		]);
	});

	test("FrameDecoder buffers across chunks", () => {
		const msg = { type: "open", id: "s0" };
		const full = encodeFrame(msg);
		const dec = new FrameDecoder();
		dec.push(full.subarray(0, 2));
		expect(dec.drain()).toEqual([]);
		dec.push(full.subarray(2, 6));
		expect(dec.drain()).toEqual([]);
		dec.push(full.subarray(6));
		expect(dec.drain()).toEqual([{ message: msg, payload: null }]);
	});

	test("FrameDecoder handles partial frame after a complete one", () => {
		const a = { type: "open", id: "s0" };
		const b = { type: "open", id: "s1" };
		const buf = Buffer.concat([encodeFrame(a), encodeFrame(b)]);
		const dec = new FrameDecoder();
		dec.push(buf.subarray(0, encodeFrame(a).length + 3));
		expect(dec.drain()).toEqual([{ message: a, payload: null }]);
		dec.push(buf.subarray(encodeFrame(a).length + 3));
		expect(dec.drain()).toEqual([{ message: b, payload: null }]);
	});

	test("rejects oversized frames", () => {
		const bigHeader = Buffer.alloc(4);
		bigHeader.writeUInt32BE(20 * 1024 * 1024, 0); // 20 MB
		const dec = new FrameDecoder();
		dec.push(bigHeader);
		expect(() => dec.drain()).toThrow(/frame too large/);
	});

	test("rejects frames smaller than the inner header", () => {
		// totalLen=2 is impossible — the inner jsonLen prefix alone is 4 bytes.
		const tinyHeader = Buffer.alloc(4);
		tinyHeader.writeUInt32BE(2, 0);
		const dec = new FrameDecoder();
		dec.push(tinyHeader);
		expect(() => dec.drain()).toThrow(/frame too small/);
	});

	test("rejects jsonLen larger than the frame body", () => {
		// totalLen = 6 (4 inner-len + 2 body), but jsonLen claims 99.
		const malformed = Buffer.alloc(4 + 6);
		malformed.writeUInt32BE(6, 0);
		malformed.writeUInt32BE(99, 4);
		const dec = new FrameDecoder();
		dec.push(malformed);
		expect(() => dec.drain()).toThrow(/jsonLen/);
	});
});

describe("framing — frames with binary payload", () => {
	test("round-trips a JSON header + arbitrary bytes", () => {
		const msg = { type: "output", id: "s0" };
		const payload = Uint8Array.from([0x00, 0xff, 0x80, 0x42]);
		const frame = encodeFrame(msg, payload);
		const decoded = decodeFrame(frame);
		expect(decoded.message).toEqual(msg);
		expect(decoded.payload).toEqual(payload);
	});

	test("payload survives chunk boundaries through FrameDecoder", () => {
		const msg = { type: "output", id: "s0" };
		// Include bytes that are problematic in JSON (0x00, high bytes).
		const payload = Uint8Array.from([
			0x00, 0xff, 0xc0, 0x80, 0x9d, 0xe2, 0x98, 0x83,
		]);
		const frame = encodeFrame(msg, payload);
		const dec = new FrameDecoder();
		// Split into three pieces, none aligned with internal boundaries.
		dec.push(frame.subarray(0, 5));
		dec.push(frame.subarray(5, 12));
		dec.push(frame.subarray(12));
		const drained = dec.drain();
		expect(drained).toHaveLength(1);
		expect(drained[0]?.message).toEqual(msg);
		expect(drained[0]?.payload).toEqual(payload);
	});

	test("empty payload round-trips as null", () => {
		// Passing an explicit empty Uint8Array should still decode as `null`
		// (the wire layout makes payloadLen=0 and absent indistinguishable —
		// we normalize on the receive side so callers don't have to branch).
		const msg = { type: "output", id: "s0" };
		const decoded = decodeFrame(encodeFrame(msg, new Uint8Array(0)));
		expect(decoded.payload).toBeNull();
	});

	test("payload bytes are decoupled from the streaming buffer", () => {
		// Regression check: the decoder must copy payload bytes out of its
		// internal buffer; otherwise advancing past the frame could leave the
		// caller's `payload` aliasing freed/reused memory.
		const msg = { type: "input", id: "s0" };
		const payload = Buffer.from("hello world");
		const dec = new FrameDecoder();
		dec.push(encodeFrame(msg, payload));
		const [frame] = dec.drain();
		// Push something else through; the decoder may reuse its internal buffer.
		dec.push(encodeFrame({ type: "open", id: "s1" }));
		dec.drain();
		expect(Buffer.from(frame?.payload ?? new Uint8Array()).toString()).toBe(
			"hello world",
		);
	});
});
