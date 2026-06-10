import { z } from "zod";

export const setFontSettingsSchema = z.object({
	terminalFontFamily: z.string().max(500).nullable().optional(),
	terminalFontSize: z.number().int().min(10).max(24).nullable().optional(),
	terminalFontWeight: z.number().int().min(100).max(900).nullable().optional(),
	terminalLineHeight: z.number().min(1).max(3).nullable().optional(),
	editorFontFamily: z.string().max(500).nullable().optional(),
	editorFontSize: z.number().int().min(10).max(24).nullable().optional(),
	editorFontWeight: z.number().int().min(100).max(900).nullable().optional(),
	editorLineHeight: z.number().min(1).max(3).nullable().optional(),
});

export type SetFontSettingsInput = z.infer<typeof setFontSettingsSchema>;

export function transformFontSettings(
	input: SetFontSettingsInput,
): Record<string, string | number | null> {
	const set: Record<string, string | number | null> = {};

	if (input.terminalFontFamily !== undefined) {
		set.terminalFontFamily = input.terminalFontFamily?.trim() || null;
	}
	if (input.terminalFontSize !== undefined) {
		set.terminalFontSize = input.terminalFontSize;
	}
	if (input.terminalFontWeight !== undefined) {
		set.terminalFontWeight = input.terminalFontWeight;
	}
	if (input.terminalLineHeight !== undefined) {
		set.terminalLineHeight = input.terminalLineHeight;
	}
	if (input.editorFontFamily !== undefined) {
		set.editorFontFamily = input.editorFontFamily?.trim() || null;
	}
	if (input.editorFontSize !== undefined) {
		set.editorFontSize = input.editorFontSize;
	}
	if (input.editorFontWeight !== undefined) {
		set.editorFontWeight = input.editorFontWeight;
	}
	if (input.editorLineHeight !== undefined) {
		set.editorLineHeight = input.editorLineHeight;
	}

	return set;
}
