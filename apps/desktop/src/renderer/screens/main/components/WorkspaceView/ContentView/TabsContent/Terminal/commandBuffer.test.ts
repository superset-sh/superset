import { describe, expect, it } from "bun:test";
import { isCommandEchoed, sanitizeForTitle } from "./commandBuffer";

function makeXterm(
	lines: Array<{ text: string; isWrapped?: boolean }>,
	options: {
		cursorX?: number;
		cursorY?: number;
		viewportY?: number;
	} = {},
) {
	const {
		cursorX = lines.at(-1)?.text.length ?? 0,
		cursorY = Math.max(lines.length - 1, 0),
		viewportY = 0,
	} = options;

	return {
		buffer: {
			active: {
				cursorX,
				cursorY,
				viewportY,
				getLine: (index: number) => {
					const line = lines[index];
					if (!line) return undefined;

					return {
						isWrapped: line.isWrapped ?? false,
						translateToString: () => line.text,
					};
				},
			},
		},
	};
}

describe("sanitizeForTitle", () => {
	it("should keep normal text unchanged", () => {
		expect(sanitizeForTitle("ls -la ./src")).toBe("ls -la ./src");
	});

	it("should keep uppercase letters", () => {
		expect(sanitizeForTitle("openCode")).toBe("openCode");
	});

	it("should keep special characters", () => {
		expect(sanitizeForTitle("npm install @scope/pkg")).toBe(
			"npm install @scope/pkg",
		);
	});

	it("should strip ANSI escape sequences", () => {
		expect(sanitizeForTitle("\x1b[32mgreen\x1b[0m")).toBe("green");
		expect(sanitizeForTitle("\x1b[1;34mbold blue\x1b[0m")).toBe("bold blue");
	});

	it("should truncate to max length", () => {
		const longCommand = "a".repeat(100);
		const result = sanitizeForTitle(longCommand);
		expect(result?.length).toBe(32);
	});

	it("should return null for empty result", () => {
		expect(sanitizeForTitle("")).toBeNull();
	});

	it("should return null for whitespace-only result", () => {
		expect(sanitizeForTitle("   ")).toBeNull();
	});

	it("should trim whitespace", () => {
		expect(sanitizeForTitle("  command  ")).toBe("command");
	});
});

describe("isCommandEchoed", () => {
	it("returns true when the rendered prompt line ends with the typed command", () => {
		const xterm = makeXterm([{ text: "$ ls -la" }]);

		expect(isCommandEchoed(xterm, "ls -la")).toBe(true);
	});

	it("returns false when masked input is not echoed on screen", () => {
		const xterm = makeXterm([{ text: "[sudo] password for alice: " }]);

		expect(isCommandEchoed(xterm, "hunter2")).toBe(false);
	});

	it("returns false when the prompt contains the same substring as the secret", () => {
		const xterm = makeXterm([{ text: "[sudo] password for alice: " }]);

		expect(isCommandEchoed(xterm, "alice")).toBe(false);
	});

	it("returns true for commands that wrap onto the current line", () => {
		const xterm = makeXterm([
			{ text: "$ git status --", isWrapped: false },
			{ text: "short", isWrapped: true },
		]);

		expect(isCommandEchoed(xterm, "git status --short")).toBe(true);
	});

	it("uses the cursor position on the current line", () => {
		const xterm = makeXterm([{ text: "$ npm test ghost-text" }], {
			cursorX: "$ npm test".length,
		});

		expect(isCommandEchoed(xterm, "npm test")).toBe(true);
		expect(isCommandEchoed(xterm, "npm test ghost-text")).toBe(false);
	});

	it("returns false for empty commands", () => {
		const xterm = makeXterm([{ text: "$ " }]);

		expect(isCommandEchoed(xterm, "")).toBe(false);
		expect(isCommandEchoed(xterm, "   ")).toBe(false);
	});
});
