import { observable } from "@trpc/server/observable";
import { appState } from "main/lib/app-state";
import type { TabsState, ThemeState } from "main/lib/app-state/schemas";
import { hotkeysEmitter } from "main/lib/hotkeys-events";
import {
	buildOverridesFromBindings,
	HOTKEYS_STATE_VERSION,
	type HotkeysState,
} from "shared/hotkeys";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Zod schema for FileViewerState persistence.
 * Note: initialLine/initialColumn from shared/tabs-types.ts are intentionally
 * omitted as they are transient (applied once on open, not persisted).
 */
const fileViewerStateSchema = z.object({
	filePath: z.string(),
	viewMode: z.enum(["rendered", "raw", "diff"]),
	isPinned: z.boolean(),
	diffLayout: z.enum(["inline", "side-by-side"]),
	diffCategory: z
		.enum(["against-base", "committed", "staged", "unstaged"])
		.optional(),
	commitHash: z.string().optional(),
	oldPath: z.string().optional(),
});

/**
 * Zod schema for Pane
 */
const paneSchema = z.object({
	id: z.string(),
	tabId: z.string(),
	type: z.enum(["terminal", "webview", "file-viewer", "chat"]),
	name: z.string(),
	isNew: z.boolean().optional(),
	status: z.enum(["idle", "working", "permission", "review"]).optional(),
	initialCommands: z.array(z.string()).optional(),
	initialCwd: z.string().optional(),
	url: z.string().optional(),
	cwd: z.string().nullable().optional(),
	cwdConfirmed: z.boolean().optional(),
	fileViewer: fileViewerStateSchema.optional(),
	chat: z.object({ sessionId: z.string() }).optional(),
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

const hotkeysStateSchema = z.object({
	version: z.number(),
	byPlatform: z.object({
		darwin: z.record(z.string(), z.string().nullable()).default({}),
		win32: z.record(z.string(), z.string().nullable()).default({}),
		linux: z.record(z.string(), z.string().nullable()).default({}),
	}),
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

		// Hotkeys state procedures
		hotkeys: router({
			get: publicProcedure.query((): HotkeysState => {
				return appState.data.hotkeysState;
			}),

			set: publicProcedure
				.input(hotkeysStateSchema)
				.mutation(async ({ input }) => {
					const version =
						input.version === HOTKEYS_STATE_VERSION
							? input.version
							: HOTKEYS_STATE_VERSION;

					const normalized: HotkeysState = {
						version,
						byPlatform: {
							darwin: buildOverridesFromBindings(
								input.byPlatform.darwin ?? {},
								"darwin",
							),
							win32: buildOverridesFromBindings(
								input.byPlatform.win32 ?? {},
								"win32",
							),
							linux: buildOverridesFromBindings(
								input.byPlatform.linux ?? {},
								"linux",
							),
						},
					};

					appState.data.hotkeysState = normalized;
					await appState.write();
					hotkeysEmitter.emit("change", {
						version: normalized.version,
						updatedAt: new Date().toISOString(),
					});
					return { success: true };
				}),

			subscribe: publicProcedure.subscription(() => {
				return observable<{ version: number; updatedAt: string }>((emit) => {
					const onChange = (data: { version: number; updatedAt: string }) => {
						emit.next(data);
					};
					hotkeysEmitter.on("change", onChange);
					return () => {
						hotkeysEmitter.off("change", onChange);
					};
				});
			}),
		}),
	});
};
