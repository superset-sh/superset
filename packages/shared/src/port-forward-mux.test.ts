import { describe, expect, test } from "bun:test";
import {
	decodeHelloVersion,
	decodeMuxFrame,
	decodeOpenFail,
	decodeOpenPort,
	decodeWindowDelta,
	encodeClose,
	encodeData,
	encodeEof,
	encodeHello,
	encodeOpen,
	encodeOpened,
	encodeOpenFail,
	encodePing,
	encodePong,
	encodeWindow,
	MUX_PROTOCOL_VERSION,
	MUX_SESSION_STREAM_ID,
	MuxFrameType,
	MuxOpenFailCode,
} from "./port-forward-mux";

describe("port-forward mux framing", () => {
	test("hello round-trips the protocol version", () => {
		const f = decodeMuxFrame(encodeHello());
		expect(f?.type).toBe(MuxFrameType.hello);
		expect(f?.streamId).toBe(MUX_SESSION_STREAM_ID);
		expect(f && decodeHelloVersion(f)).toBe(MUX_PROTOCOL_VERSION);
	});

	test("open round-trips stream id and port", () => {
		const f = decodeMuxFrame(encodeOpen(7, 3000));
		expect(f?.type).toBe(MuxFrameType.open);
		expect(f?.streamId).toBe(7);
		expect(f && decodeOpenPort(f)).toBe(3000);
	});

	test("open with the maximum port survives", () => {
		const f = decodeMuxFrame(encodeOpen(0xffffffff, 65_535));
		expect(f?.streamId).toBe(0xffffffff);
		expect(f && decodeOpenPort(f)).toBe(65_535);
	});

	test("open-fail carries code and message", () => {
		const f = decodeMuxFrame(
			encodeOpenFail(3, MuxOpenFailCode.portNotOwned, "port not owned"),
		);
		expect(f && decodeOpenFail(f)).toEqual({
			code: MuxOpenFailCode.portNotOwned,
			message: "port not owned",
		});
	});

	test("data payload is passed through byte-exact", () => {
		const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
		const f = decodeMuxFrame(encodeData(9, bytes));
		expect(f?.type).toBe(MuxFrameType.data);
		expect(Array.from(f?.payload ?? [])).toEqual(Array.from(bytes));
	});

	test("data payload that itself looks like a frame is not confused", () => {
		// A DATA payload starting with a valid header must decode as the outer
		// frame, not the inner bytes.
		const inner = encodeClose(1);
		const f = decodeMuxFrame(encodeData(2, inner));
		expect(f?.type).toBe(MuxFrameType.data);
		expect(f?.streamId).toBe(2);
		expect(Array.from(f?.payload ?? [])).toEqual(Array.from(inner));
	});

	test("window round-trips the delta", () => {
		const f = decodeMuxFrame(encodeWindow(4, 262_144));
		expect(f && decodeWindowDelta(f)).toBe(262_144);
	});

	test("eof, close, ping, pong decode to their types", () => {
		expect(decodeMuxFrame(encodeEof(1))?.type).toBe(MuxFrameType.eof);
		expect(decodeMuxFrame(encodeClose(1))?.type).toBe(MuxFrameType.close);
		expect(decodeMuxFrame(encodePing())?.type).toBe(MuxFrameType.ping);
		expect(decodeMuxFrame(encodePong())?.type).toBe(MuxFrameType.pong);
		expect(decodeMuxFrame(encodeOpened(1))?.type).toBe(MuxFrameType.opened);
	});

	test("malformed input decodes to null", () => {
		expect(decodeMuxFrame(new Uint8Array())).toBeNull();
		expect(decodeMuxFrame(new Uint8Array([4, 0, 0]))).toBeNull();
		expect(decodeMuxFrame(new Uint8Array([0x7f, 0, 0, 0, 1]))).toBeNull();
	});

	test("zero-delta window and zero port are rejected", () => {
		const w = decodeMuxFrame(encodeWindow(1, 0));
		expect(w && decodeWindowDelta(w)).toBeNull();
		const o = decodeMuxFrame(encodeOpen(1, 0));
		expect(o && decodeOpenPort(o)).toBeNull();
	});

	test("decode respects byteOffset of a larger buffer", () => {
		// Simulates a frame arriving inside a pooled Buffer slice.
		const encoded = encodeOpen(5, 8080);
		const padded = new Uint8Array(encoded.byteLength + 8);
		padded.set(encoded, 8);
		const view = padded.subarray(8);
		const f = decodeMuxFrame(view);
		expect(f?.streamId).toBe(5);
		expect(f && decodeOpenPort(f)).toBe(8080);
	});
});
