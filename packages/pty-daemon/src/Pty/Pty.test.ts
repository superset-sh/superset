import { describe, expect, test } from "bun:test";
import { OscInputFilter, spawn } from "./Pty.ts";

// node-pty's runtime requires Node (Bun's tty.ReadStream handling is
// incompatible with the master fd setup). The daemon ships running under
// node; integration spawn tests live in test/integration.ts and run via
// `npm run test:integration`. Here we only cover the synchronous validation
// logic that doesn't require spawning a real PTY.

describe("Pty wrapper (validation only — spawn behavior tested under node)", () => {
	test("rejects invalid spawn dims (cols)", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 0, rows: 24 },
			}),
		).toThrow(/invalid cols/);
	});

	test("rejects invalid spawn dims (rows)", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 0 },
			}),
		).toThrow(/invalid rows/);
	});

	test("rejects non-integer dims", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 80.5, rows: 24 },
			}),
		).toThrow(/invalid cols/);
	});

	test("strips OSC sequences from input bytes", () => {
		const filter = new OscInputFilter();
		const filtered = filter.write(
			Buffer.from(
				"ab\x1b]10;?\x07cd\x1b]11;?\x07ef\x1b]52;c;Zm9v\x07gh",
				"utf8",
			),
		);
		expect(filtered.toString("utf8")).toBe("abcdefgh");
	});

	test("strips OSC sequences split across input chunks", () => {
		const filter = new OscInputFilter();
		expect(filter.write(Buffer.from("a\x1b]10;?", "utf8")).toString()).toBe(
			"a",
		);
		expect(filter.write(Buffer.from("\x07b", "utf8")).toString()).toBe("b");
	});

	test("preserves non-OSC escape sequences", () => {
		const filter = new OscInputFilter();
		const filtered = filter.write(Buffer.from("a\x1b[A", "utf8"));
		expect(filtered).toEqual(Buffer.from("a\x1b[A", "utf8"));
	});

	test("preserves standalone escape at input chunk boundary", () => {
		const filter = new OscInputFilter();
		expect(filter.write(Buffer.from("\x1b", "utf8"))).toEqual(
			Buffer.from("\x1b", "utf8"),
		);
	});
});
