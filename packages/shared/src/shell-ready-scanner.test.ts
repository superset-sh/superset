import { describe, expect, it } from "bun:test";
import { createScanState, scanForShellReady } from "./shell-ready-scanner";

const enc = new TextEncoder();
const dec = new TextDecoder();

describe("shell-ready scanner (bytes)", () => {
	it("strips the OSC 133;A marker from a single chunk", () => {
		const state = createScanState();
		const r = scanForShellReady(state, enc.encode("hello\x1b]133;A\x07$ "));
		expect(r.matched).toBe(true);
		expect(dec.decode(r.output)).toBe("hello$ ");
	});

	it("matches the marker spanning two chunks without dropping bytes", () => {
		const state = createScanState();
		const a = scanForShellReady(state, enc.encode("\x1b]133"));
		expect(a.matched).toBe(false);
		expect(a.output.length).toBe(0);
		const b = scanForShellReady(state, enc.encode(";A\x07"));
		expect(b.matched).toBe(true);
		expect(b.output.length).toBe(0);
	});

	it("flushes held bytes that turned out not to be a marker", () => {
		const state = createScanState();
		// Starts looking like the marker, then bails on the second char.
		const r = scanForShellReady(state, enc.encode("\x1bX"));
		expect(r.matched).toBe(false);
		expect(dec.decode(r.output)).toBe("\x1bX");
	});

	it("passes UTF-8 bytes through verbatim — even split mid-codepoint", () => {
		// The whole point of the byte scanner: no per-chunk utf-8 decoding,
		// so a smiley split across chunks survives untouched.
		const state = createScanState();
		const smiley = enc.encode("🙂"); // 4 bytes
		const a = scanForShellReady(state, smiley.subarray(0, 2));
		const b = scanForShellReady(state, smiley.subarray(2));
		const combined = new Uint8Array(a.output.length + b.output.length);
		combined.set(a.output, 0);
		combined.set(b.output, a.output.length);
		expect(dec.decode(combined)).toBe("🙂");
	});
});
