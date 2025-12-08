import { describe, expect, it } from "bun:test";
import { processCommandInput, sanitizeForTitle } from "./commandBuffer";

describe("processCommandInput", () => {
	describe("enter key submission", () => {
		it("should submit command on carriage return", () => {
			const result = processCommandInput("ls -la", "\r");
			expect(result.submittedCommand).toBe("ls -la");
			expect(result.buffer).toBe("");
		});

		it("should submit command on newline", () => {
			const result = processCommandInput("git status", "\n");
			expect(result.submittedCommand).toBe("git status");
			expect(result.buffer).toBe("");
		});

		it("should trim whitespace from submitted command", () => {
			const result = processCommandInput("  npm install  ", "\r");
			expect(result.submittedCommand).toBe("npm install");
		});

		it("should return null for empty buffer submission", () => {
			const result = processCommandInput("", "\r");
			expect(result.submittedCommand).toBeNull();
			expect(result.buffer).toBe("");
		});

		it("should return null for whitespace-only buffer submission", () => {
			const result = processCommandInput("   ", "\r");
			expect(result.submittedCommand).toBeNull();
		});
	});

	describe("backspace handling", () => {
		it("should remove last character on backspace (\\x7f)", () => {
			const result = processCommandInput("hello", "\x7f");
			expect(result.buffer).toBe("hell");
			expect(result.submittedCommand).toBeNull();
		});

		it("should remove last character on backspace (\\b)", () => {
			const result = processCommandInput("world", "\b");
			expect(result.buffer).toBe("worl");
			expect(result.submittedCommand).toBeNull();
		});

		it("should handle backspace on empty buffer", () => {
			const result = processCommandInput("", "\x7f");
			expect(result.buffer).toBe("");
		});
	});

	describe("cancel handling", () => {
		it("should clear buffer on Ctrl+C (\\x03)", () => {
			const result = processCommandInput("partial command", "\x03");
			expect(result.buffer).toBe("");
			expect(result.submittedCommand).toBeNull();
		});

		it("should clear buffer on Ctrl+U (\\x15)", () => {
			const result = processCommandInput("another command", "\x15");
			expect(result.buffer).toBe("");
			expect(result.submittedCommand).toBeNull();
		});
	});

	describe("printable character input", () => {
		it("should append printable characters to buffer", () => {
			const result = processCommandInput("hel", "lo");
			expect(result.buffer).toBe("hello");
			expect(result.submittedCommand).toBeNull();
		});

		it("should append tab character", () => {
			const result = processCommandInput("echo", "\t");
			expect(result.buffer).toBe("echo\t");
		});

		it("should filter out non-printable characters", () => {
			const result = processCommandInput("cmd", "\x01\x02abc");
			expect(result.buffer).toBe("cmdabc");
		});

		it("should handle empty input", () => {
			const result = processCommandInput("existing", "");
			expect(result.buffer).toBe("existing");
		});
	});

	describe("edge cases", () => {
		it("should handle mixed input with enter taking precedence", () => {
			const result = processCommandInput("cmd", "x\r");
			expect(result.submittedCommand).toBe("cmd");
			expect(result.buffer).toBe("");
		});

		it("should start from empty buffer", () => {
			const result = processCommandInput("", "first");
			expect(result.buffer).toBe("first");
		});
	});
});

describe("sanitizeForTitle", () => {
	it("should keep lowercase alphanumeric and common chars", () => {
		expect(sanitizeForTitle("ls -la ./src")).toBe("ls -la ./src");
	});

	it("should strip uppercase (escape codes use A-Z)", () => {
		expect(sanitizeForTitle("open[Code")).toBe("openode");
	});

	it("should strip special characters", () => {
		expect(sanitizeForTitle("[?1016;2$y command")).toBe("10162y command");
	});

	it("should truncate to max length", () => {
		const longCommand = "a".repeat(100);
		const result = sanitizeForTitle(longCommand);
		expect(result?.length).toBe(32);
	});

	it("should return null for empty result", () => {
		expect(sanitizeForTitle("[]$;?")).toBeNull();
	});

	it("should return null for whitespace-only result", () => {
		expect(sanitizeForTitle("   ")).toBeNull();
	});

	it("should trim whitespace", () => {
		expect(sanitizeForTitle("  command  ")).toBe("command");
	});
});
