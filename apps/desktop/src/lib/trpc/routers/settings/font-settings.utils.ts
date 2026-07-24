import { z } from "zod";

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

function halfStepNumber(min: number, max: number) {
	return steppedNumber(min, max, 2);
}

function tenthStepNumber(min: number, max: number) {
	return steppedNumber(min, max, 10);
}

const fontWeightSchema = z
	.number()
	.int()
	.min(100)
	.max(900)
	.refine((value) => value % 100 === 0, {
		message: "Must use 100 increments",
	});

export const setFontSettingsSchema = z.object({
	terminalFontFamily: z.string().max(500).nullable().optional(),
	terminalFontSize: halfStepNumber(10, 24).nullable().optional(),
	terminalLineHeight: tenthStepNumber(1, 2.5).nullable().optional(),
	terminalLetterSpacing: tenthStepNumber(-2, 4).nullable().optional(),
	terminalFontWeight: fontWeightSchema.nullable().optional(),
	terminalLigatures: z.boolean().nullable().optional(),
	terminalMinimumContrast: z
		.union([z.literal(1), z.literal(3), z.literal(4.5), z.literal(7)])
		.nullable()
		.optional(),
	terminalCursorStyle: z
		.enum(["block", "bar", "underline"])
		.nullable()
		.optional(),
	terminalCursorBlink: z.boolean().nullable().optional(),
	editorFontFamily: z.string().max(500).nullable().optional(),
	editorFontSize: halfStepNumber(10, 24).nullable().optional(),
	editorLineHeight: tenthStepNumber(1, 2.5).nullable().optional(),
	editorLetterSpacing: tenthStepNumber(-2, 4).nullable().optional(),
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
