import type { ITerminalOptions } from "@xterm/xterm";

export const TERMINAL_RENDERING_OPTIONS = {
	rescaleOverlappingGlyphs: true,
} satisfies Pick<ITerminalOptions, "rescaleOverlappingGlyphs">;
