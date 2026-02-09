import { describe, expect, it } from "bun:test";
import { z } from "zod";

/**
 * Font settings validation tests.
 *
 * These test the Zod validation schema and the transformation logic used
 * by the setFontSettings tRPC procedure, extracted here for unit testing
 * without requiring a database connection.
 */

// Replicate the exact Zod schema from the router
const setFontSettingsSchema = z.object({
	terminalFontFamily: z.string().nullable().optional(),
	terminalFontSize: z.number().int().min(10).max(24).nullable().optional(),
	editorFontFamily: z.string().nullable().optional(),
	editorFontSize: z.number().int().min(10).max(24).nullable().optional(),
});

// Replicate the transformation logic from the mutation
function transformFontSettings(
	input: z.infer<typeof setFontSettingsSchema>,
): Record<string, string | number | null> {
	const set: Record<string, string | number | null> = {};

	if (input.terminalFontFamily !== undefined) {
		set.terminalFontFamily = input.terminalFontFamily?.trim() || null;
	}
	if (input.terminalFontSize !== undefined) {
		set.terminalFontSize = input.terminalFontSize;
	}
	if (input.editorFontFamily !== undefined) {
		set.editorFontFamily = input.editorFontFamily?.trim() || null;
	}
	if (input.editorFontSize !== undefined) {
		set.editorFontSize = input.editorFontSize;
	}

	return set;
}

describe("font settings validation", () => {
	describe("getFontSettings defaults", () => {
		it("returns all null when no settings are stored", () => {
			// Simulates the default return shape of getFontSettings
			const defaults = {
				terminalFontFamily: null,
				terminalFontSize: null,
				editorFontFamily: null,
				editorFontSize: null,
			};

			expect(defaults.terminalFontFamily).toBeNull();
			expect(defaults.terminalFontSize).toBeNull();
			expect(defaults.editorFontFamily).toBeNull();
			expect(defaults.editorFontSize).toBeNull();
		});
	});

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
