import { describe, expect, it } from "bun:test";
import { sanitizeRestoredScrollback } from "./sanitize-restored-scrollback";

describe("sanitizeRestoredScrollback", () => {
	it("removes stateful mode toggles but keeps visible output", () => {
		const input =
			"before\n" +
			"\x1b[?1049h" + // alt-screen on
			"\x1b[?1h" + // application cursor keys on
			"\x1b[?2004h" + // bracketed paste on
			"\x1b[10;20r" + // scroll region
			"\x1b[?25l" + // cursor hidden
			"\nhello\x1b[31m red \x1b[0mworld\n" +
			"\x1b[?1049l" + // alt-screen off
			"after";

		const out = sanitizeRestoredScrollback(input);

		expect(out).toContain("before");
		expect(out).toContain("hello");
		expect(out).toContain("\x1b[31m"); // SGR preserved
		expect(out).toContain("after");

		expect(out).not.toContain("\x1b[?1049h");
		expect(out).not.toContain("\x1b[?1h");
		expect(out).not.toContain("\x1b[?2004h");
		expect(out).not.toContain("\x1b[10;20r");
		expect(out).not.toContain("\x1b[?25l");
	});

	it("removes RIS/DECSTR resets", () => {
		const input = `x\x1bc y\x1b[!p z`;
		expect(sanitizeRestoredScrollback(input)).toBe("x y z");
	});
});
