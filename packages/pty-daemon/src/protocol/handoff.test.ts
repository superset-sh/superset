import { describe, expect, test } from "bun:test";
import { decodeFrame, encodeFrame, FrameDecoder } from "./framing.ts";
import type { HandoffMessage } from "./handoff.ts";

describe("handoff protocol", () => {
	test("upgrade-ready round-trips through framing", () => {
		const msg: HandoffMessage = { type: "upgrade-ready", successorPid: 42 };
		const decoded = decodeFrame(encodeFrame(msg));
		expect(decoded.message).toEqual(msg);
		expect(decoded.payload).toBeNull();
	});

	for (const msg of [
		{ type: "upgrade-commit" } as const,
		{ type: "upgrade-listening", successorPid: 43 } as const,
	]) {
		test(`${msg.type} round-trips through framing`, () => {
			const decoded = decodeFrame(encodeFrame(msg));
			expect(decoded.message).toEqual(msg);
			expect(decoded.payload).toBeNull();
		});
	}

	test("upgrade-nak round-trips with reason string", () => {
		const msg: HandoffMessage = {
			type: "upgrade-nak",
			reason: "snapshot version mismatch",
		};
		const decoded = decodeFrame(encodeFrame(msg));
		expect(decoded.message).toEqual(msg);
		expect(decoded.payload).toBeNull();
	});

	test("FrameDecoder handles a stream of handoff messages", () => {
		const a: HandoffMessage = { type: "upgrade-ready", successorPid: 1 };
		const b: HandoffMessage = { type: "upgrade-nak", reason: "test" };
		const dec = new FrameDecoder();
		dec.push(Buffer.concat([encodeFrame(a), encodeFrame(b)]));
		expect(dec.drain().map((f) => f.message)).toEqual([a, b]);
	});
});
