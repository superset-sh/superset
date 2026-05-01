import { describe, expect, test } from "bun:test";
import { decodeFrame, encodeFrame, FrameDecoder } from "./framing.ts";

describe("framing", () => {
	test("round-trips a simple object", () => {
		const msg = { type: "hello", protocols: [1] };
		const frame = encodeFrame(msg);
		expect(decodeFrame(frame)).toEqual(msg);
	});

	test("round-trips through FrameDecoder", () => {
		const a = { type: "open", id: "s0" };
		const b = { type: "input", id: "s0", data: "aGk=" };
		const dec = new FrameDecoder();
		dec.push(Buffer.concat([encodeFrame(a), encodeFrame(b)]));
		expect(dec.drain()).toEqual([a, b]);
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
		expect(dec.drain()).toEqual([msg]);
	});

	test("FrameDecoder handles partial frame after a complete one", () => {
		const a = { type: "open", id: "s0" };
		const b = { type: "open", id: "s1" };
		const buf = Buffer.concat([encodeFrame(a), encodeFrame(b)]);
		const dec = new FrameDecoder();
		dec.push(buf.subarray(0, encodeFrame(a).length + 3));
		expect(dec.drain()).toEqual([a]);
		dec.push(buf.subarray(encodeFrame(a).length + 3));
		expect(dec.drain()).toEqual([b]);
	});

	test("rejects oversized frames", () => {
		const bigHeader = Buffer.alloc(4);
		bigHeader.writeUInt32BE(20 * 1024 * 1024, 0); // 20 MB
		const dec = new FrameDecoder();
		dec.push(bigHeader);
		expect(() => dec.drain()).toThrow(/frame too large/);
	});
});
