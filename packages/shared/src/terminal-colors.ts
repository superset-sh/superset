import { z } from "zod";

export const DEFAULT_TERMINAL_ANSI = [
	"#2e3436",
	"#cc0000",
	"#4e9a06",
	"#c4a000",
	"#3465a4",
	"#75507b",
	"#06989a",
	"#d3d7cf",
	"#555753",
	"#ef2929",
	"#8ae234",
	"#fce94f",
	"#729fcf",
	"#ad7fa8",
	"#34e2e2",
	"#eeeeec",
];

const rgb = z.string().regex(/^#[\da-f]{6}$/i);

export const terminalColorsSchema = z.object({
	foreground: rgb,
	background: rgb,
	cursor: rgb,
	ansi: z.array(rgb).length(16).optional(),
});

export type TerminalColors = z.infer<typeof terminalColorsSchema>;

export function fallbackTerminalColors(light = false): TerminalColors {
	return {
		foreground: light ? "#000000" : "#ffffff",
		background: light ? "#ffffff" : "#000000",
		cursor: light ? "#000000" : "#ffffff",
	};
}
