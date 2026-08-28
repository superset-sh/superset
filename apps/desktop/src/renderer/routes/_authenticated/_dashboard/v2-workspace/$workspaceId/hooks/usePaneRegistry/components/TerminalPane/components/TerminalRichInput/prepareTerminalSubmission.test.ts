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
	it("appends attachment paths after the prompt", () => {
		expect(
			prepareTerminalSubmission("look at this", [
				".superset/attachments/image.png",
			]),
		).toBe("look at this .superset/attachments/image.png");
	});

	it("sends attachments with no typed text", () => {
		// Pasting a screenshot and hitting send is a valid submission.
		expect(
			prepareTerminalSubmission("", [".superset/attachments/image.png"]),
		).toBe(".superset/attachments/image.png");
		expect(
			prepareTerminalSubmission("   ", [".superset/attachments/a.png"]),
		).toBe(".superset/attachments/a.png");
	});

	it("shell-escapes attachment paths that need it", () => {
		expect(
			prepareTerminalSubmission("check", [".superset/attachments/my shot.png"]),
		).toBe("check '.superset/attachments/my shot.png'");
	});

	it("separates multiple attachment paths", () => {
		expect(
			prepareTerminalSubmission("both", [
				".superset/attachments/a.png",
				".superset/attachments/b.png",
			]),
		).toBe("both .superset/attachments/a.png .superset/attachments/b.png");
	});

	it("still returns null when there is neither text nor an attachment", () => {
		expect(prepareTerminalSubmission("   ", [])).toBeNull();
	});
});
