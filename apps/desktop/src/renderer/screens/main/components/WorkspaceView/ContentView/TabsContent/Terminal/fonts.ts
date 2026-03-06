export const BUNDLED_TERMINAL_FONT_FAMILY = "Superset Terminal Mono";
export const BUNDLED_TERMINAL_FONT_SOURCE_FAMILY = "MesloLGS Nerd Font Mono";

export function isBundledTerminalFontFamily(value: string): boolean {
	const family = value.trim().toLowerCase();
	return (
		family === BUNDLED_TERMINAL_FONT_FAMILY.toLowerCase() ||
		family === BUNDLED_TERMINAL_FONT_SOURCE_FAMILY.toLowerCase()
	);
}
