import {
	FONT_FAMILY_MAX_LENGTH,
	FONT_SIZE_LIMITS,
	FONT_WEIGHT_LIMITS,
	LETTER_SPACING_LIMITS,
	LINE_HEIGHT_LIMITS,
	type NumberLimits,
	TERMINAL_CURSOR_STYLES,
	TERMINAL_MINIMUM_CONTRAST_CHOICES,
} from "@superset/shared/settings-constraints";
import { z } from "zod";

function limitedNumber(limits: NumberLimits) {
	const step = limits.step ?? 0;
	return steppedNumber(limits.min, limits.max, step > 0 ? 1 / step : 1);
}

function steppedNumber(min: number, max: number, multiplier: number) {
	return z
		.number()
		.min(min)
		.max(max)
		.refine(
			(value) => {
				const product = value * multiplier;
				return Math.abs(product - Math.round(product)) < 1e-9;
			},
			{ message: `Must use ${1 / multiplier} increments` },
		);
}

// step of 100 already implies integers
const fontWeightSchema = limitedNumber(FONT_WEIGHT_LIMITS);

const contrastSchema = z.union([
	z.literal(TERMINAL_MINIMUM_CONTRAST_CHOICES[0]),
	z.literal(TERMINAL_MINIMUM_CONTRAST_CHOICES[1]),
	z.literal(TERMINAL_MINIMUM_CONTRAST_CHOICES[2]),
	z.literal(TERMINAL_MINIMUM_CONTRAST_CHOICES[3]),
]);

export const setFontSettingsSchema = z.object({
	terminalFontFamily: z
		.string()
		.max(FONT_FAMILY_MAX_LENGTH)
		.nullable()
		.optional(),
	terminalFontSize: limitedNumber(FONT_SIZE_LIMITS).nullable().optional(),
	terminalLineHeight: limitedNumber(LINE_HEIGHT_LIMITS).nullable().optional(),
	terminalLetterSpacing: limitedNumber(LETTER_SPACING_LIMITS)
		.nullable()
		.optional(),
	terminalFontWeight: fontWeightSchema.nullable().optional(),
	terminalLigatures: z.boolean().nullable().optional(),
	terminalMinimumContrast: contrastSchema.nullable().optional(),
	terminalCursorStyle: z.enum(TERMINAL_CURSOR_STYLES).nullable().optional(),
	terminalCursorBlink: z.boolean().nullable().optional(),
	editorFontFamily: z
		.string()
		.max(FONT_FAMILY_MAX_LENGTH)
		.nullable()
		.optional(),
	editorFontSize: limitedNumber(FONT_SIZE_LIMITS).nullable().optional(),
	editorLineHeight: limitedNumber(LINE_HEIGHT_LIMITS).nullable().optional(),
	editorLetterSpacing: limitedNumber(LETTER_SPACING_LIMITS)
		.nullable()
		.optional(),
	editorFontWeight: fontWeightSchema.nullable().optional(),
	editorLigatures: z.boolean().nullable().optional(),
});

export type SetFontSettingsInput = z.infer<typeof setFontSettingsSchema>;

export function transformFontSettings(
	input: SetFontSettingsInput,
): Record<string, boolean | string | number | null> {
	const set: Record<string, boolean | string | number | null> = {};

	if (input.terminalFontFamily !== undefined) {
		set.terminalFontFamily = input.terminalFontFamily?.trim() || null;
	}
	if (input.terminalFontSize !== undefined) {
		set.terminalFontSize = input.terminalFontSize;
	}
	if (input.terminalLineHeight !== undefined) {
		set.terminalLineHeight = input.terminalLineHeight;
	}
	if (input.terminalLetterSpacing !== undefined) {
		set.terminalLetterSpacing = input.terminalLetterSpacing;
	}
	if (input.terminalFontWeight !== undefined) {
		set.terminalFontWeight = input.terminalFontWeight;
	}
	if (input.terminalLigatures !== undefined) {
		set.terminalLigatures = input.terminalLigatures;
	}
	if (input.terminalMinimumContrast !== undefined) {
		set.terminalMinimumContrast = input.terminalMinimumContrast;
	}
	if (input.terminalCursorStyle !== undefined) {
		set.terminalCursorStyle = input.terminalCursorStyle;
	}
	if (input.terminalCursorBlink !== undefined) {
		set.terminalCursorBlink = input.terminalCursorBlink;
	}
	if (input.editorFontFamily !== undefined) {
		set.editorFontFamily = input.editorFontFamily?.trim() || null;
	}
	if (input.editorFontSize !== undefined) {
		set.editorFontSize = input.editorFontSize;
	}
	if (input.editorLineHeight !== undefined) {
		set.editorLineHeight = input.editorLineHeight;
	}
	if (input.editorLetterSpacing !== undefined) {
		set.editorLetterSpacing = input.editorLetterSpacing;
	}
	if (input.editorFontWeight !== undefined) {
		set.editorFontWeight = input.editorFontWeight;
	}
	if (input.editorLigatures !== undefined) {
		set.editorLigatures = input.editorLigatures;
	}

	return set;
}
