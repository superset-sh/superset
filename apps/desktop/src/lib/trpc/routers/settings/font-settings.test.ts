import { describe, expect, it } from "bun:test";
import {
	setFontSettingsSchema,
	transformFontSettings,
} from "./font-settings.utils";

describe("font settings validation", () => {
	describe("font size validation (range 10-24)", () => {
		it("accepts font size at minimum (10)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontSize: 10,
			});
			expect(result.success).toBe(true);
		});

		it("accepts font size at maximum (24)", () => {
			const result = setFontSettingsSchema.safeParse({
				editorFontSize: 24,
			});
			expect(result.success).toBe(true);
		});

		it("accepts font size in the middle of range", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontSize: 14,
				editorFontSize: 16,
			});
			expect(result.success).toBe(true);
		});

		it("rejects font size below minimum (< 10)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontSize: 9,
			});
			expect(result.success).toBe(false);
		});

		it("rejects font size of 0", () => {
			const result = setFontSettingsSchema.safeParse({
				editorFontSize: 0,
			});
			expect(result.success).toBe(false);
		});

		it("rejects font size above maximum (> 24)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontSize: 25,
			});
			expect(result.success).toBe(false);
		});

		it("rejects very large font size", () => {
			const result = setFontSettingsSchema.safeParse({
				editorFontSize: 100,
			});
			expect(result.success).toBe(false);
		});

		it("rejects non-integer font sizes", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontSize: 14.5,
			});
			expect(result.success).toBe(false);
		});

		it("accepts null font size (reset)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontSize: null,
				editorFontSize: null,
			});
			expect(result.success).toBe(true);
		});
	});

	describe("font weight validation (range 100-900)", () => {
		it("accepts font weight at minimum (100)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontWeight: 100,
			});
			expect(result.success).toBe(true);
		});

		it("accepts font weight at maximum (900)", () => {
			const result = setFontSettingsSchema.safeParse({ editorFontWeight: 900 });
			expect(result.success).toBe(true);
		});

		it("rejects font weight below minimum (< 100)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontWeight: 50,
			});
			expect(result.success).toBe(false);
		});

		it("rejects font weight above maximum (> 900)", () => {
			const result = setFontSettingsSchema.safeParse({
				editorFontWeight: 1000,
			});
			expect(result.success).toBe(false);
		});

		it("rejects non-integer font weight", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontWeight: 450.5,
			});
			expect(result.success).toBe(false);
		});

		it("accepts null font weight (reset)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontWeight: null,
				editorFontWeight: null,
			});
			expect(result.success).toBe(true);
		});
	});

	describe("line height validation (range 1-3)", () => {
		it("accepts line height at minimum (1)", () => {
			const result = setFontSettingsSchema.safeParse({ terminalLineHeight: 1 });
			expect(result.success).toBe(true);
		});

		it("accepts fractional line height", () => {
			const result = setFontSettingsSchema.safeParse({ editorLineHeight: 1.5 });
			expect(result.success).toBe(true);
		});

		it("accepts line height at maximum (3)", () => {
			const result = setFontSettingsSchema.safeParse({ terminalLineHeight: 3 });
			expect(result.success).toBe(true);
		});

		it("rejects line height below minimum (< 1)", () => {
			const result = setFontSettingsSchema.safeParse({ editorLineHeight: 0.5 });
			expect(result.success).toBe(false);
		});

		it("rejects line height above maximum (> 3)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalLineHeight: 3.5,
			});
			expect(result.success).toBe(false);
		});

		it("accepts null line height (reset)", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalLineHeight: null,
				editorLineHeight: null,
			});
			expect(result.success).toBe(true);
		});
	});

	describe("weight + line height transform passthrough", () => {
		it("passes weight and line height values through unchanged", () => {
			const input = setFontSettingsSchema.parse({
				terminalFontWeight: 600,
				terminalLineHeight: 1.4,
				editorFontWeight: 300,
				editorLineHeight: 1.8,
			});
			const result = transformFontSettings(input);
			expect(result.terminalFontWeight).toBe(600);
			expect(result.terminalLineHeight).toBe(1.4);
			expect(result.editorFontWeight).toBe(300);
			expect(result.editorLineHeight).toBe(1.8);
		});

		it("passes null weight and line height through (reset)", () => {
			const input = setFontSettingsSchema.parse({
				editorFontWeight: null,
				editorLineHeight: null,
			});
			const result = transformFontSettings(input);
			expect(result.editorFontWeight).toBeNull();
			expect(result.editorLineHeight).toBeNull();
		});
	});

	describe("font family trimming", () => {
		it("trims whitespace from font family", () => {
			const input = setFontSettingsSchema.parse({
				terminalFontFamily: "  JetBrains Mono  ",
			});
			const result = transformFontSettings(input);
			expect(result.terminalFontFamily).toBe("JetBrains Mono");
		});

		it("trims whitespace from editor font family", () => {
			const input = setFontSettingsSchema.parse({
				editorFontFamily: "  Fira Code  ",
			});
			const result = transformFontSettings(input);
			expect(result.editorFontFamily).toBe("Fira Code");
		});

		it("accepts valid font families without modification", () => {
			const input = setFontSettingsSchema.parse({
				terminalFontFamily: "JetBrains Mono",
				editorFontFamily: "Fira Code",
			});
			const result = transformFontSettings(input);
			expect(result.terminalFontFamily).toBe("JetBrains Mono");
			expect(result.editorFontFamily).toBe("Fira Code");
		});

		it("accepts common monospace fonts", () => {
			const fonts = [
				"JetBrains Mono",
				"Fira Code",
				"Source Code Pro",
				"Cascadia Code",
				"IBM Plex Mono",
				"Hack",
				"Inconsolata",
			];

			for (const font of fonts) {
				const input = setFontSettingsSchema.parse({
					terminalFontFamily: font,
				});
				const result = transformFontSettings(input);
				expect(result.terminalFontFamily).toBe(font);
			}
		});
	});

	describe("empty string as null (reset)", () => {
		it("treats empty string font family as null", () => {
			const input = setFontSettingsSchema.parse({
				terminalFontFamily: "",
			});
			const result = transformFontSettings(input);
			expect(result.terminalFontFamily).toBeNull();
		});

		it("treats whitespace-only font family as null", () => {
			const input = setFontSettingsSchema.parse({
				editorFontFamily: "   ",
			});
			const result = transformFontSettings(input);
			expect(result.editorFontFamily).toBeNull();
		});

		it("treats null font family as null", () => {
			const input = setFontSettingsSchema.parse({
				terminalFontFamily: null,
			});
			const result = transformFontSettings(input);
			expect(result.terminalFontFamily).toBeNull();
		});
	});

	describe("partial updates", () => {
		it("only includes provided fields in the result", () => {
			const input = setFontSettingsSchema.parse({
				terminalFontFamily: "Fira Code",
			});
			const result = transformFontSettings(input);
			expect(result.terminalFontFamily).toBe("Fira Code");
			expect(result).not.toHaveProperty("editorFontFamily");
			expect(result).not.toHaveProperty("terminalFontSize");
			expect(result).not.toHaveProperty("editorFontSize");
		});

		it("accepts empty input (no changes)", () => {
			const input = setFontSettingsSchema.parse({});
			const result = transformFontSettings(input);
			expect(Object.keys(result)).toHaveLength(0);
		});
	});
});
