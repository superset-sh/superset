/**
 * Theme type definitions for the Superset desktop app
 *
 * Themes control both UI colors (via CSS variables) and terminal colors (via xterm.js)
 */

/**
 * Default xterm.js terminal colors for dark mode
 */
export const DEFAULT_TERMINAL_COLORS_DARK: TerminalColors = {
	background: "#000000",
	foreground: "#ffffff",
	cursor: "#ffffff",
	cursorAccent: "#000000",
	selectionBackground: "#4d4d4d",

	// Standard ANSI colors (xterm defaults)
	black: "#2e3436",
	red: "#cc0000",
	green: "#4e9a06",
	yellow: "#c4a000",
	blue: "#3465a4",
	magenta: "#75507b",
	cyan: "#06989a",
	white: "#d3d7cf",

	// Bright ANSI colors (xterm defaults)
	brightBlack: "#555753",
	brightRed: "#ef2929",
	brightGreen: "#8ae234",
	brightYellow: "#fce94f",
	brightBlue: "#729fcf",
	brightMagenta: "#ad7fa8",
	brightCyan: "#34e2e2",
	brightWhite: "#eeeeec",
};

/**
 * Default xterm.js terminal colors for light mode
 */
export const DEFAULT_TERMINAL_COLORS_LIGHT: TerminalColors = {
	background: "#ffffff",
	foreground: "#000000",
	cursor: "#000000",
	cursorAccent: "#ffffff",
	selectionBackground: "#add6ff",

	// Standard ANSI colors (xterm defaults)
	black: "#2e3436",
	red: "#cc0000",
	green: "#4e9a06",
	yellow: "#c4a000",
	blue: "#3465a4",
	magenta: "#75507b",
	cyan: "#06989a",
	white: "#d3d7cf",

	// Bright ANSI colors (xterm defaults)
	brightBlack: "#555753",
	brightRed: "#ef2929",
	brightGreen: "#8ae234",
	brightYellow: "#fce94f",
	brightBlue: "#729fcf",
	brightMagenta: "#ad7fa8",
	brightCyan: "#34e2e2",
	brightWhite: "#eeeeec",
};

/**
 * Get default terminal colors based on theme type
 */
export function getDefaultTerminalColors(
	type: "dark" | "light",
): TerminalColors {
	return type === "dark"
		? DEFAULT_TERMINAL_COLORS_DARK
		: DEFAULT_TERMINAL_COLORS_LIGHT;
}

/**
 * Get terminal colors from a theme, falling back to defaults if not defined
 */
export function getTerminalColors(theme: Theme): TerminalColors {
	return theme.terminal ?? getDefaultTerminalColors(theme.type);
}

/**
 * UI color definitions for the application chrome
 * Color values should be valid CSS color strings (hex, rgb, oklch, etc.)
 */
export interface UIColors {
	// Core backgrounds
	background: string;
	foreground: string;

	// Card/Panel backgrounds
	card: string;
	cardForeground: string;

	// Popover/Dropdown
	popover: string;
	popoverForeground: string;

	// Primary actions (buttons, links)
	primary: string;
	primaryForeground: string;

	// Secondary elements
	secondary: string;
	secondaryForeground: string;

	// Muted/subtle elements
	muted: string;
	mutedForeground: string;

	// Accent highlights
	accent: string;
	accentForeground: string;

	// Tertiary (panel toolbars)
	tertiary: string;
	tertiaryActive: string;

	// Destructive actions
	destructive: string;
	destructiveForeground: string;

	// Borders and inputs
	border: string;
	input: string;
	ring: string;

	// Sidebar specific
	sidebar: string;
	sidebarForeground: string;
	sidebarPrimary: string;
	sidebarPrimaryForeground: string;
	sidebarAccent: string;
	sidebarAccentForeground: string;
	sidebarBorder: string;
	sidebarRing: string;

	// Chart/data visualization colors
	chart1: string;
	chart2: string;
	chart3: string;
	chart4: string;
	chart5: string;

	// Search highlight colors (CSS Custom Highlight API)
	highlightMatch: string;
	highlightActive: string;
}

/**
 * Terminal ANSI color palette
 * Standard 16-color ANSI palette plus background/foreground/cursor
 */
export interface TerminalColors {
	// Background and foreground
	background: string;
	foreground: string;
	cursor: string;
	cursorAccent?: string;
	selectionBackground?: string;
	selectionForeground?: string;

	// Standard ANSI colors (0-7)
	black: string;
	red: string;
	green: string;
	yellow: string;
	blue: string;
	magenta: string;
	cyan: string;
	white: string;

	// Bright ANSI colors (8-15)
	brightBlack: string;
	brightRed: string;
	brightGreen: string;
	brightYellow: string;
	brightBlue: string;
	brightMagenta: string;
	brightCyan: string;
	brightWhite: string;
}

/**
 * Complete theme definition
 */
export interface Theme {
	/** Unique identifier (slug) */
	id: string;
	/** Display name */
	name: string;
	/** Theme author */
	author?: string;
	/** Theme version */
	version?: string;
	/** Theme description */
	description?: string;
	/** Theme type for system preference matching */
	type: "dark" | "light";

	/** UI colors for app chrome */
	ui: UIColors;
	/** Terminal ANSI colors (optional, falls back to xterm defaults based on theme type) */
	terminal?: TerminalColors;

	/** Whether this is a built-in theme */
	isBuiltIn?: boolean;
	/** Whether this is a user-imported custom theme */
	isCustom?: boolean;
}

/**
 * Theme metadata for lists (without full color data)
 */
export interface ThemeMetadata {
	id: string;
	name: string;
	author?: string;
	type: "dark" | "light";
	isBuiltIn: boolean;
	isCustom: boolean;
}
