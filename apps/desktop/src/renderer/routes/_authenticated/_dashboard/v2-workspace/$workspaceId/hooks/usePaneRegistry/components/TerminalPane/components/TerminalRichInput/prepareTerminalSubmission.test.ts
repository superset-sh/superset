import { describe, expect, it } from "bun:test";
import { prepareTerminalSubmission } from "./prepareTerminalSubmission";

describe("prepareTerminalSubmission", () => {
	it("returns null for empty or whitespace-only input", () => {
		expect(prepareTerminalSubmission("")).toBeNull();
		expect(prepareTerminalSubmission("   ")).toBeNull();
		expect(prepareTerminalSubmission("\n\n  \t")).toBeNull();
	});

	it("preserves embedded newlines (multiline prompt stays one block)", () => {
		const multiline = "first line\nsecond line\nthird";
		expect(prepareTerminalSubmission(multiline)).toBe(multiline);
	});

	it("strips escape/control sequences but keeps the printable payload", () => {
		// A stray CSI sequence must not survive into the PTY as garbage.
		const withEscape = "hello \x1b[31mworld\x1b[0m";
		expect(prepareTerminalSubmission(withEscape)).toBe("hello world");
	});

	it("does not trim meaningful leading/trailing content, only gates on emptiness", () => {
		expect(prepareTerminalSubmission("  keep me  ")).toBe("  keep me  ");
	});
});
