// Theme types

// Built-in themes
export {
	builtInThemes,
	DEFAULT_THEME_ID,
	darkTheme,
	getBuiltInTheme,
	lightTheme,
	monokaiTheme,
} from "./built-in";
export { parseThemeConfigFile, type ThemeConfigParseResult } from "./import";
export type {
	EditorColors,
	EditorSyntaxColors,
	EditorTheme,
	TerminalColors,
	Theme,
	ThemeMetadata,
	UIColors,
} from "./types";
export {
	DEFAULT_TERMINAL_COLORS_DARK,
	DEFAULT_TERMINAL_COLORS_LIGHT,
	getDefaultTerminalColors,
	getEditorTheme,
	getTerminalColors,
} from "./types";
