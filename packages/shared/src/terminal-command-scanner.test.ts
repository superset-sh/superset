import { describe, expect, it } from "bun:test";
import {
	createTerminalCommandScanState,
	scanForTerminalCommandEvents,
} from "./terminal-command-scanner";

describe("terminal command scanner", () => {
	it("strips OSC 133 markers and emits command events", () => {
		const state = createTerminalCommandScanState();
		const result = scanForTerminalCommandEvents(
			state,
			"a\x1b]133;A\x07b\x1b]133;C\x07c\x1b]133;D;2\x07d",
		);

		expect(result.output).toBe("abcd");
		expect(result.events).toEqual([
			{ type: "prompt" },
			{ type: "commandStart", command: null },
			{ type: "commandFinish", exitCode: 2 },
		]);
	});

	it("parses command text from command start markers", () => {
		const state = createTerminalCommandScanState();
		const result = scanForTerminalCommandEvents(
			state,
			"a\x1b]133;C;echo one; echo two\x07b",
		);

		expect(result.output).toBe("ab");
		expect(result.events).toEqual([
			{ type: "commandStart", command: "echo one; echo two" },
		]);
	});

	it("handles fragmented OSC sequences", () => {
		const state = createTerminalCommandScanState();

		expect(scanForTerminalCommandEvents(state, "one \x1b]133;").output).toBe(
			"one ",
		);
		const result = scanForTerminalCommandEvents(state, "C\x07 two");

		expect(result.output).toBe(" two");
		expect(result.events).toEqual([{ type: "commandStart", command: null }]);
	});

	it("handles ST and C1 terminators", () => {
		const state = createTerminalCommandScanState();

		expect(
			scanForTerminalCommandEvents(state, "\x1b]133;C\x1b\\\x1b]133;D;0\x9c")
				.events,
		).toEqual([
			{ type: "commandStart", command: null },
			{ type: "commandFinish", exitCode: 0 },
		]);
	});

	it("preserves unsupported OSC sequences", () => {
		const state = createTerminalCommandScanState();
		const result = scanForTerminalCommandEvents(
			state,
			"\x1b]2;Terminal\x07x\x1b]133;A\x07",
		);

		expect(result.output).toBe("\x1b]2;Terminal\x07x");
		expect(result.events).toEqual([{ type: "prompt" }]);
	});

	it("does not retain oversized incomplete OSC payloads", () => {
		const state = createTerminalCommandScanState();
		const result = scanForTerminalCommandEvents(
			state,
			`\x1b]133;${"🙂".repeat(1024)}`,
		);

		expect(result.events).toEqual([]);
		expect(result.output).toContain("\x1b]133;");
		expect(state.buffer).toBe("");
	});
});
