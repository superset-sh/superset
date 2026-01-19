import { describe, expect, it } from "bun:test";
import { parseModesFromData, parseModesWithCarryBuffer } from "./terminalModes";

const ESC = "\x1b";

describe("parseModesFromData", () => {
	describe("alternate screen mode", () => {
		it("should detect entering alternate screen with xterm sequence", () => {
			const result = parseModesFromData(`${ESC}[?1049h`);
			expect(result.alternateScreen).toBe(true);
		});

		it("should detect entering alternate screen with older sequence", () => {
			const result = parseModesFromData(`${ESC}[?47h`);
			expect(result.alternateScreen).toBe(true);
		});

		it("should detect exiting alternate screen with xterm sequence", () => {
			const result = parseModesFromData(`${ESC}[?1049l`);
			expect(result.alternateScreen).toBe(false);
		});

		it("should detect exiting alternate screen with older sequence", () => {
			const result = parseModesFromData(`${ESC}[?47l`);
			expect(result.alternateScreen).toBe(false);
		});

		it("should use last occurrence when multiple enter/exit cycles", () => {
			// Simulates: enter vim, exit vim, enter vim again
			const data = `${ESC}[?1049h some content ${ESC}[?1049l exit ${ESC}[?1049h`;
			const result = parseModesFromData(data);
			expect(result.alternateScreen).toBe(true);
		});

		it("should return false when last action is exit", () => {
			const data = `${ESC}[?1049h some content ${ESC}[?1049l`;
			const result = parseModesFromData(data);
			expect(result.alternateScreen).toBe(false);
		});

		it("should preserve previous mode when no sequences present", () => {
			const result = parseModesFromData("some regular output", {
				alternateScreen: true,
				bracketedPaste: false,
			});
			expect(result.alternateScreen).toBe(true);
		});
	});

	describe("bracketed paste mode", () => {
		it("should detect enabling bracketed paste", () => {
			const result = parseModesFromData(`${ESC}[?2004h`);
			expect(result.bracketedPaste).toBe(true);
		});

		it("should detect disabling bracketed paste", () => {
			const result = parseModesFromData(`${ESC}[?2004l`);
			expect(result.bracketedPaste).toBe(false);
		});

		it("should use last occurrence when toggled multiple times", () => {
			const data = `${ESC}[?2004h enable ${ESC}[?2004l disable ${ESC}[?2004h`;
			const result = parseModesFromData(data);
			expect(result.bracketedPaste).toBe(true);
		});

		it("should preserve previous mode when no sequences present", () => {
			const result = parseModesFromData("some regular output", {
				alternateScreen: false,
				bracketedPaste: true,
			});
			expect(result.bracketedPaste).toBe(true);
		});
	});

	describe("combined modes", () => {
		it("should detect both modes in same data chunk", () => {
			const data = `${ESC}[?1049h${ESC}[?2004h`;
			const result = parseModesFromData(data);
			expect(result.alternateScreen).toBe(true);
			expect(result.bracketedPaste).toBe(true);
		});

		it("should handle mixed sequences", () => {
			const data = `${ESC}[?2004h shell prompt ${ESC}[?1049h vim opens ${ESC}[?2004l`;
			const result = parseModesFromData(data);
			expect(result.alternateScreen).toBe(true);
			expect(result.bracketedPaste).toBe(false);
		});
	});
});

describe("parseModesWithCarryBuffer", () => {
	it("should handle sequence split across chunks", () => {
		// Sequence \x1b[?1049h split across chunks
		const { modes, newCarryBuffer } = parseModesWithCarryBuffer(
			"?1049h",
			`${ESC}[`,
			{ alternateScreen: false, bracketedPaste: false },
		);

		expect(modes.alternateScreen).toBe(true);
		// Carry buffer should contain tail for next chunk
		expect(newCarryBuffer.length).toBeLessThanOrEqual(32);
	});

	it("should preserve modes across chunks without sequences", () => {
		const { modes } = parseModesWithCarryBuffer("regular output", "", {
			alternateScreen: true,
			bracketedPaste: true,
		});

		expect(modes.alternateScreen).toBe(true);
		expect(modes.bracketedPaste).toBe(true);
	});

	it("should update carry buffer with tail of combined data", () => {
		const { newCarryBuffer } = parseModesWithCarryBuffer(
			`some output with partial sequence at end ${ESC}`,
			"",
			{ alternateScreen: false, bracketedPaste: false },
		);

		// Should include the partial ESC for next chunk
		expect(newCarryBuffer).toContain(ESC);
	});

	it("should limit carry buffer to 32 characters", () => {
		const longData = "a".repeat(100);
		const { newCarryBuffer } = parseModesWithCarryBuffer(longData, "", {
			alternateScreen: false,
			bracketedPaste: false,
		});

		expect(newCarryBuffer.length).toBe(32);
	});
});
