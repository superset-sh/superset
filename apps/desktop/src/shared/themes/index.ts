// Theme types

// Built-in themes
export {
	builtInThemes,
	DEFAULT_THEME_ID,
	darkTheme,
	getBuiltInTheme,
	lightTheme,
	monokaiTheme,
	oneDarkTheme,
} from "./built-in";
export { parseThemeConfigFile, type ThemeConfigParseResult } from "./import";
export type { TerminalColors, Theme, ThemeMetadata, UIColors } from "./types";
export {
	DEFAULT_TERMINAL_COLORS_DARK,
	DEFAULT_TERMINAL_COLORS_LIGHT,
	getDefaultTerminalColors,
	getTerminalColors,
} from "./types";
