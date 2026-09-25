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

		it("accepts half-pixel font sizes", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontSize: 15.5,
				editorFontSize: 14.5,
			});
			expect(result.success).toBe(true);
		});

		it("rejects font sizes outside half-pixel increments", () => {
			const result = setFontSettingsSchema.safeParse({
				terminalFontSize: 15.25,
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

	describe("secondary typography validation", () => {
		it("accepts decimal steps without floating-point precision failures", () => {
			for (const value of [1.1, 1.3, 1.9]) {
				expect(
					setFontSettingsSchema.safeParse({
						editorLineHeight: value,
						terminalLineHeight: value,
						editorLetterSpacing: value,
						terminalLetterSpacing: value,
					}).success,
				).toBe(true);
			}
		});

		it("accepts independent editor and terminal controls", () => {
			const result = setFontSettingsSchema.safeParse({
				editorLineHeight: 1.4,
				editorLetterSpacing: -0.2,
				editorFontWeight: 500,
				editorLigatures: false,
				terminalLineHeight: 1.2,
				terminalLetterSpacing: 1,
				terminalFontWeight: 600,
				terminalLigatures: true,
				terminalMinimumContrast: 4.5,
				terminalCursorStyle: "bar",
				terminalCursorBlink: false,
			});
			expect(result.success).toBe(true);
		});

		it("accepts every supported terminal contrast ratio", () => {
			for (const contrast of [1, 3, 4.5, 7]) {
				expect(
					setFontSettingsSchema.safeParse({
						terminalMinimumContrast: contrast,
					}).success,
				).toBe(true);
			}
		});

		it("rejects invalid steps, weights, contrast, and cursor styles", () => {
			expect(
				setFontSettingsSchema.safeParse({ editorLineHeight: 1.25 }).success,
			).toBe(false);
			expect(
				setFontSettingsSchema.safeParse({ terminalLetterSpacing: 0.55 })
					.success,
			).toBe(false);
			expect(
				setFontSettingsSchema.safeParse({ editorFontWeight: 450 }).success,
			).toBe(false);
			expect(
				setFontSettingsSchema.safeParse({ terminalMinimumContrast: 2 }).success,
			).toBe(false);
			expect(
				setFontSettingsSchema.safeParse({ terminalCursorStyle: "beam" })
					.success,
			).toBe(false);
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
		it("preserves half-pixel values and every secondary override", () => {
			const input = setFontSettingsSchema.parse({
				editorFontSize: 15.5,
				editorLineHeight: 1.6,
				editorLetterSpacing: 0.2,
				editorFontWeight: 500,
				editorLigatures: false,
				terminalMinimumContrast: 7,
				terminalCursorStyle: "underline",
				terminalCursorBlink: false,
			});
			expect(transformFontSettings(input)).toEqual(input);
		});

		it("retains nulls so reset clears every override", () => {
			const input = setFontSettingsSchema.parse({
				editorLineHeight: null,
				editorLetterSpacing: null,
				editorFontWeight: null,
				editorLigatures: null,
				terminalLineHeight: null,
				terminalLetterSpacing: null,
				terminalFontWeight: null,
				terminalLigatures: null,
				terminalMinimumContrast: null,
				terminalCursorStyle: null,
				terminalCursorBlink: null,
			});
			expect(transformFontSettings(input)).toEqual(input);
		});
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
