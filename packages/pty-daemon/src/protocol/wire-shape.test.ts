// Wire-shape invariants. These trip the moment anyone re-introduces a
// shape we explicitly removed in protocol v2. Cheap to run (no socket,
// no shell), targeted at specific past-mistake patterns.

import { describe, expect, test } from "bun:test";
import { decodeFrame, encodeFrame } from "./framing.ts";

const HEADER = 4;
const INNER = 4;

describe("v2 wire shape", () => {
	test("output frames carry bytes in the binary tail, not the JSON header", () => {
		// Pre-v2 shape was `{ type: "output", id, data: "<base64>" }`. If
		// anyone reintroduces that, the JSON portion will contain "data".
		// This test lays a tripwire: the JSON for an output frame must
		// describe the message and nothing more.
		const frame = encodeFrame(
			{ type: "output", id: "s0" },
			Buffer.from("hello"),
		);

		const totalLen = frame.readUInt32BE(0);
		const jsonLen = frame.readUInt32BE(HEADER);
		const json = frame
			.subarray(HEADER + INNER, HEADER + INNER + jsonLen)
			.toString("utf8");

		expect(JSON.parse(json)).toEqual({ type: "output", id: "s0" });
		expect(json).not.toContain("data");
		// jsonLen strictly less than totalLen-INNER ⇒ a binary tail exists.
		expect(jsonLen).toBeLessThan(totalLen - INNER);
	});

	test("input frames carry bytes in the binary tail, not the JSON header", () => {
		// Same shape on the other direction. The motivating bug for v2 was
		// output-side; input followed for symmetry, and reintroducing
		// `data: data.toString("base64")` here would silently double-encode.
		const frame = encodeFrame(
			{ type: "input", id: "s0" },
			Buffer.from([0xc0, 0x80, 0xff]),
		);

		const jsonLen = frame.readUInt32BE(HEADER);
		const json = frame
			.subarray(HEADER + INNER, HEADER + INNER + jsonLen)
			.toString("utf8");

		expect(JSON.parse(json)).toEqual({ type: "input", id: "s0" });
		expect(json).not.toContain("data");
	});

	test("control frames have jsonLen === totalLen - 4 (no payload)", () => {
		// Control messages must NOT accidentally pick up a binary tail —
		// that would either confuse the receiver or mask a real bug where
		// someone slips bytes through a JSON-only message type.
		const cases = [
			{ type: "hello-ack", protocol: 2, daemonVersion: "x" },
			{ type: "open-ok", id: "s0", pid: 123 },
			{ type: "closed", id: "s0" },
			{ type: "exit", id: "s0", code: 0, signal: null },
			{ type: "list-reply", sessions: [] },
			{ type: "error", message: "x" },
		];
		for (const msg of cases) {
			const frame = encodeFrame(msg);
			const totalLen = frame.readUInt32BE(0);
			const jsonLen = frame.readUInt32BE(HEADER);
			expect(jsonLen).toBe(totalLen - INNER);
			expect(decodeFrame(frame).payload).toBeNull();
		}
	});

	test("payload bytes ARE the bytes — not base64, not anything else", () => {
		// Round-trip a buffer of bytes whose base64 encoding is a recognizable
		// distinct string ("aGVsbG8=" ← "hello"), then assert the wire frame
		// contains the raw bytes ("hello") and NOT their base64 form.
		const bytes = Buffer.from("hello");
		const frame = encodeFrame({ type: "output", id: "s0" }, bytes);

		const totalLen = frame.readUInt32BE(0);
		const jsonLen = frame.readUInt32BE(HEADER);
		const tail = frame.subarray(HEADER + INNER + jsonLen, HEADER + totalLen);
		expect(tail).toEqual(bytes);
		// Defensive: if someone reintroduces base64, the tail would be the
		// 8-char "aGVsbG8=" instead of the 5-byte "hello".
		expect(tail.toString("utf8")).not.toBe("aGVsbG8=");
	});
});
