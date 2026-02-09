import { z } from "zod";

export const setFontSettingsSchema = z.object({
	terminalFontFamily: z.string().max(500).nullable().optional(),
	terminalFontSize: z.number().int().min(10).max(24).nullable().optional(),
	editorFontFamily: z.string().max(500).nullable().optional(),
	editorFontSize: z.number().int().min(10).max(24).nullable().optional(),
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
	if (input.editorFontFamily !== undefined) {
		set.editorFontFamily = input.editorFontFamily?.trim() || null;
	}
	if (input.editorFontSize !== undefined) {
		set.editorFontSize = input.editorFontSize;
	}

	return set;
}
