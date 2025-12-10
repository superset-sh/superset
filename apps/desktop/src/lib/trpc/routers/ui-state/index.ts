import { appState } from "main/lib/app-state";
import type { TabsState, ThemeState } from "main/lib/app-state/schemas";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Zod schema for Pane
 */
const paneSchema = z.object({
	id: z.string(),
	tabId: z.string(),
	type: z.enum(["terminal", "webview"]),
	name: z.string(),
	isNew: z.boolean().optional(),
	needsAttention: z.boolean().optional(),
	initialCommands: z.array(z.string()).optional(),
	initialCwd: z.string().optional(),
	url: z.string().optional(),
});

/**
 * Zod schema for MosaicNode<string> (recursive tree structure for pane layouts)
 */
type MosaicNode =
	| string
	| {
			direction: "row" | "column";
			first: MosaicNode;
			second: MosaicNode;
			splitPercentage?: number;
	  };
const mosaicNodeSchema: z.ZodType<MosaicNode> = z.lazy(() =>
	z.union([
		z.string(), // Leaf node (paneId)
		z.object({
			direction: z.enum(["row", "column"]),
			first: mosaicNodeSchema,
			second: mosaicNodeSchema,
			splitPercentage: z.number().optional(),
		}),
	]),
);

/**
 * Zod schema for Tab (extends BaseTab with layout)
 */
const tabSchema = z.object({
	id: z.string(),
	name: z.string(),
	userTitle: z.string().optional(),
	workspaceId: z.string(),
	createdAt: z.number(),
	layout: mosaicNodeSchema,
});

/**
 * Zod schema for TabsState
 */
const tabsStateSchema = z.object({
	tabs: z.array(tabSchema),
	panes: z.record(z.string(), paneSchema),
	activeTabIds: z.record(z.string(), z.string().nullable()),
	focusedPaneIds: z.record(z.string(), z.string()),
	tabHistoryStacks: z.record(z.string(), z.array(z.string())),
});

/**
 * Zod schema for UI colors
 */
const uiColorsSchema = z.object({
	background: z.string(),
	foreground: z.string(),
	card: z.string(),
	cardForeground: z.string(),
	popover: z.string(),
	popoverForeground: z.string(),
	primary: z.string(),
	primaryForeground: z.string(),
	secondary: z.string(),
	secondaryForeground: z.string(),
	muted: z.string(),
	mutedForeground: z.string(),
	accent: z.string(),
	accentForeground: z.string(),
	tertiary: z.string(),
	tertiaryActive: z.string(),
	destructive: z.string(),
	destructiveForeground: z.string(),
	border: z.string(),
	input: z.string(),
	ring: z.string(),
	sidebar: z.string(),
	sidebarForeground: z.string(),
	sidebarPrimary: z.string(),
	sidebarPrimaryForeground: z.string(),
	sidebarAccent: z.string(),
	sidebarAccentForeground: z.string(),
	sidebarBorder: z.string(),
	sidebarRing: z.string(),
	chart1: z.string(),
	chart2: z.string(),
	chart3: z.string(),
	chart4: z.string(),
	chart5: z.string(),
});

/**
 * Zod schema for terminal colors
 */
const terminalColorsSchema = z.object({
	background: z.string(),
	foreground: z.string(),
	cursor: z.string(),
	cursorAccent: z.string().optional(),
	selectionBackground: z.string().optional(),
	selectionForeground: z.string().optional(),
	black: z.string(),
	red: z.string(),
	green: z.string(),
	yellow: z.string(),
	blue: z.string(),
	magenta: z.string(),
	cyan: z.string(),
	white: z.string(),
	brightBlack: z.string(),
	brightRed: z.string(),
	brightGreen: z.string(),
	brightYellow: z.string(),
	brightBlue: z.string(),
	brightMagenta: z.string(),
	brightCyan: z.string(),
	brightWhite: z.string(),
});

/**
 * Zod schema for Theme
 */
const themeSchema = z.object({
	id: z.string(),
	name: z.string(),
	author: z.string().optional(),
	version: z.string().optional(),
	description: z.string().optional(),
	type: z.enum(["dark", "light"]),
	ui: uiColorsSchema,
	terminal: terminalColorsSchema,
	isBuiltIn: z.boolean().optional(),
	isCustom: z.boolean().optional(),
});

/**
 * Zod schema for ThemeState
 */
const themeStateSchema = z.object({
	activeThemeId: z.string(),
	customThemes: z.array(themeSchema),
});

/**
 * UI State router - manages tabs and theme persistence via lowdb
 */
export const createUiStateRouter = () => {
	return router({
		// Tabs state procedures
		tabs: router({
			get: publicProcedure.query((): TabsState => {
				return appState.data.tabsState;
			}),

			set: publicProcedure
				.input(tabsStateSchema)
				.mutation(async ({ input }) => {
					appState.data.tabsState = input;
					await appState.write();
					return { success: true };
				}),
		}),

		// Theme state procedures
		theme: router({
			get: publicProcedure.query((): ThemeState => {
				return appState.data.themeState;
			}),

			set: publicProcedure
				.input(themeStateSchema)
				.mutation(async ({ input }) => {
					appState.data.themeState = input;
					await appState.write();
					return { success: true };
				}),
		}),
	});
};
