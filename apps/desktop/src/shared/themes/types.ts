/**
 * Theme type definitions for the Superset desktop app
 *
 * Themes control both UI colors (via CSS variables) and terminal colors (via xterm.js)
 */

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
	selectionInactiveBackground?: string;

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

	// Extended ANSI colors (16-255) for 256-color mode
	extendedAnsi?: string[];
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
	/** Terminal ANSI colors */
	terminal: TerminalColors;

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
