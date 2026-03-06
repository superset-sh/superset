import { describe, expect, it } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { isCommandEchoed, sanitizeForTitle } from "./commandBuffer";

// ---------------------------------------------------------------------------
// Minimal mock of the xterm buffer API used by isCommandEchoed
// ---------------------------------------------------------------------------
function makeXterm(lineContent: string): XTerm {
	return {
		buffer: {
			active: {
				cursorY: 0,
				viewportY: 0,
				getLine: () => ({
					translateToString: () => lineContent,
				}),
			},
		},
	} as unknown as XTerm;
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

// ---------------------------------------------------------------------------
// isCommandEchoed — issue #2127
//
// Root cause: handleKeyPress in useTerminalLifecycle.ts accumulated every
// keystroke into commandBufferRef unconditionally.  On Enter the buffer was
// used as the tab title, leaking passwords typed at masked prompts (sudo,
// ssh, brew upgrade, …) into plaintext UI visible in screenshots / recordings.
//
// Fix: before promoting commandBufferRef to the tab title, verify that the
// accumulated chars are actually visible on the current terminal line.  When
// the PTY has echo disabled the terminal line shows only the prompt ("Password:
// ") — the typed chars are absent — so isCommandEchoed returns false and the
// title update is suppressed.
// ---------------------------------------------------------------------------
describe("isCommandEchoed — issue #2127: masked input must not leak into tab title", () => {
	// REPRODUCTION: shows the bug — password chars were indistinguishable from
	// normal input at the commandBufferRef level because accumulation was
	// unconditional.
	it("reproduces the bug: commandBufferRef accumulates password chars just like normal chars", () => {
		const commandBufferRef = { current: "" };

		// Simulate the vulnerable handleKeyPress accumulation (no echo check)
		const vulnerableAccumulate = (key: string) => {
			if (key.length === 1) {
				commandBufferRef.current += key;
			}
		};

		for (const char of "s3cr3tP@ssw0rd") {
			vulnerableAccumulate(char);
		}

		// The password sits in the buffer, ready to be used as a tab title — BUG
		expect(commandBufferRef.current).toBe("s3cr3tP@ssw0rd");
	});

	// NORMAL (echo-on) MODE: the command the user typed IS echoed on screen
	it("returns true when command appears in the terminal line (echo on)", () => {
		const xterm = makeXterm("$ ls -la");
		expect(isCommandEchoed(xterm, "ls -la")).toBe(true);
	});

	it("returns true for a multi-word command echoed after prompt", () => {
		const xterm = makeXterm("❯ git status --short");
		expect(isCommandEchoed(xterm, "git status --short")).toBe(true);
	});

	// NO-ECHO MODE: password chars are NOT echoed — the line shows only the
	// prompt text, so isCommandEchoed correctly returns false.
	it("returns false when command does not appear in terminal line (echo off / password prompt)", () => {
		// The terminal line contains only the password prompt, not the password
		const xterm = makeXterm("Password: ");
		expect(isCommandEchoed(xterm, "s3cr3tP@ssw0rd")).toBe(false);
	});

	it("returns false for a sudo password prompt scenario", () => {
		const xterm = makeXterm("[sudo] password for alice: ");
		expect(isCommandEchoed(xterm, "hunter2")).toBe(false);
	});

	it("returns false when command is empty", () => {
		const xterm = makeXterm("$ ");
		expect(isCommandEchoed(xterm, "")).toBe(false);
	});

	it("returns false when getLine returns null", () => {
		const xterm = {
			buffer: {
				active: {
					cursorY: 0,
					viewportY: 0,
					getLine: () => null,
				},
			},
		} as unknown as XTerm;
		expect(isCommandEchoed(xterm, "anything")).toBe(false);
	});

	// SECURITY: verify the fix suppresses the title update in a simulated flow
	it("fix: tab title is not updated when command chars are not echoed on screen", () => {
		const commandBufferRef = { current: "s3cr3tP@ssw0rd" }; // accumulated by onKey
		let tabTitleWasSet = false;

		// Terminal shows only the password prompt (no echo of typed chars)
		const xterm = makeXterm("Password: ");

		// Simulate the fixed handleKeyPress Enter branch
		const fixedHandleEnter = () => {
			if (isCommandEchoed(xterm, commandBufferRef.current)) {
				tabTitleWasSet = true; // would call setPaneNameRef in real code
			}
			commandBufferRef.current = "";
		};

		fixedHandleEnter();

		expect(tabTitleWasSet).toBe(false); // password NOT leaked into title
		expect(commandBufferRef.current).toBe(""); // buffer still cleared
	});

	it("fix: tab title IS updated when command chars are echoed on screen (normal mode)", () => {
		const commandBufferRef = { current: "ls -la" };
		let capturedTitle = "";

		const xterm = makeXterm("$ ls -la");

		const fixedHandleEnter = () => {
			if (isCommandEchoed(xterm, commandBufferRef.current)) {
				capturedTitle = commandBufferRef.current;
			}
			commandBufferRef.current = "";
		};

		fixedHandleEnter();

		expect(capturedTitle).toBe("ls -la"); // normal command title set correctly
		expect(commandBufferRef.current).toBe("");
	});
});
