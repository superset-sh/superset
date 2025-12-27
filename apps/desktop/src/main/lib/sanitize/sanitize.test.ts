import { describe, expect, it } from "bun:test";
import { isValidBinaryName } from "./sanitize";

describe("isValidBinaryName", () => {
	describe("valid binary names", () => {
		it("should accept simple binary names", () => {
			expect(isValidBinaryName("node")).toBe(true);
			expect(isValidBinaryName("git")).toBe(true);
			expect(isValidBinaryName("npm")).toBe(true);
			expect(isValidBinaryName("bun")).toBe(true);
		});

		it("should accept names with hyphens", () => {
			expect(isValidBinaryName("claude-code")).toBe(true);
			expect(isValidBinaryName("ts-node")).toBe(true);
			expect(isValidBinaryName("create-react-app")).toBe(true);
		});

		it("should accept names with underscores", () => {
			expect(isValidBinaryName("my_binary")).toBe(true);
			expect(isValidBinaryName("test_runner")).toBe(true);
		});

		it("should accept names with dots", () => {
			expect(isValidBinaryName("python3.11")).toBe(true);
			expect(isValidBinaryName("node.exe")).toBe(true);
		});

		it("should accept names with numbers", () => {
			expect(isValidBinaryName("python3")).toBe(true);
			expect(isValidBinaryName("gcc12")).toBe(true);
			expect(isValidBinaryName("7z")).toBe(true);
		});

		it("should accept mixed valid characters", () => {
			expect(isValidBinaryName("my-app_v2.0")).toBe(true);
			expect(isValidBinaryName("test-runner_1.2.3")).toBe(true);
		});
	});

	describe("shell injection attempts", () => {
		it("should reject command chaining with semicolon", () => {
			expect(isValidBinaryName("git; rm -rf /")).toBe(false);
			expect(isValidBinaryName("node;whoami")).toBe(false);
		});

		it("should reject command substitution", () => {
			expect(isValidBinaryName("$(whoami)")).toBe(false);
			expect(isValidBinaryName("`id`")).toBe(false);
			// biome-ignore lint/suspicious/noTemplateCurlyInString: testing security validation
			expect(isValidBinaryName("${PATH}")).toBe(false);
		});

		it("should reject pipe operators", () => {
			expect(isValidBinaryName("cat | grep")).toBe(false);
			expect(isValidBinaryName("ls|rm")).toBe(false);
		});

		it("should reject redirect operators", () => {
			expect(isValidBinaryName("echo > file")).toBe(false);
			expect(isValidBinaryName("cat < input")).toBe(false);
			expect(isValidBinaryName("cmd >> log")).toBe(false);
		});

		it("should reject ampersand operators", () => {
			expect(isValidBinaryName("cmd && rm")).toBe(false);
			expect(isValidBinaryName("cmd & bg")).toBe(false);
		});

		it("should reject quotes", () => {
			expect(isValidBinaryName("'node'")).toBe(false);
			expect(isValidBinaryName('"git"')).toBe(false);
		});

		it("should reject spaces", () => {
			expect(isValidBinaryName("my binary")).toBe(false);
			expect(isValidBinaryName(" node")).toBe(false);
			expect(isValidBinaryName("node ")).toBe(false);
		});

		it("should reject newlines and special whitespace", () => {
			expect(isValidBinaryName("node\nrm")).toBe(false);
			expect(isValidBinaryName("node\trm")).toBe(false);
			expect(isValidBinaryName("node\rrm")).toBe(false);
		});

		it("should reject path traversal", () => {
			expect(isValidBinaryName("../bin/node")).toBe(false);
			expect(isValidBinaryName("/usr/bin/node")).toBe(false);
			expect(isValidBinaryName("./node")).toBe(false);
		});

		it("should reject backslashes", () => {
			expect(isValidBinaryName("node\\")).toBe(false);
			expect(isValidBinaryName("C:\\node")).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("should reject empty string", () => {
			expect(isValidBinaryName("")).toBe(false);
		});

		it("should reject null-like values", () => {
			expect(isValidBinaryName(null as unknown as string)).toBe(false);
			expect(isValidBinaryName(undefined as unknown as string)).toBe(false);
		});

		it("should reject non-string values", () => {
			expect(isValidBinaryName(123 as unknown as string)).toBe(false);
			expect(isValidBinaryName({} as unknown as string)).toBe(false);
			expect(isValidBinaryName([] as unknown as string)).toBe(false);
		});
	});
});
