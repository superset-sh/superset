import { describe, expect, test } from "bun:test";
import {
	resolveEditorLineHeight,
	resolveFontVariantLigatures,
} from "./editor-typography";

describe("editor typography", () => {
	test("preserves the legacy rounded 1.5x line height without an override", () => {
		expect(resolveEditorLineHeight(13)).toBe(20);
		expect(resolveEditorLineHeight(15.5)).toBe(23);
	});

	test("uses the configured line-height multiplier without rounding", () => {
		expect(resolveEditorLineHeight(15.5, 1.4)).toBeCloseTo(21.7);
	});

	test("only overrides ligature CSS after the user chooses a value", () => {
		expect(resolveFontVariantLigatures()).toBeUndefined();
		expect(resolveFontVariantLigatures(true)).toBe("normal");
		expect(resolveFontVariantLigatures(false)).toBe("none");
	});
});
