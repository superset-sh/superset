import { describe, expect, it } from "bun:test";
import { parseGrokQuotaPayload } from "./grok-quota";

function varint(value: number): number[] {
	const bytes: number[] = [];
	let remaining = value;
	do {
		let byte = remaining & 0x7f;
		remaining = Math.floor(remaining / 128);
		if (remaining > 0) byte |= 0x80;
		bytes.push(byte);
	} while (remaining > 0);
	return bytes;
}

function message(field: number, payload: number[]): number[] {
	return [...varint((field << 3) | 2), ...varint(payload.length), ...payload];
}

describe("parseGrokQuotaPayload", () => {
	it("reads the weekly percent and reset from a gRPC-web frame", () => {
		const percent = new Uint8Array(4);
		new DataView(percent.buffer).setFloat32(0, 42.5, true);
		const reset = 1_800_000_000;
		const payload = message(1, [
			(1 << 3) | 5,
			...percent,
			...message(5, [...varint(1 << 3), ...varint(reset)]),
		]);
		const framed = new Uint8Array([0, 0, 0, 0, payload.length, ...payload]);
		expect(
			parseGrokQuotaPayload(framed, new Date("2026-01-01T00:00:00Z")),
		).toEqual({
			usedPercent: 42.5,
			resetsAt: new Date(reset * 1000),
		});
	});
});
