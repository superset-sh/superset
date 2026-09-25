import { TRPCError } from "@trpc/server";
import { appState } from "main/lib/app-state";
import type { TabsState, ThemeState } from "main/lib/app-state/schemas";
import { getKey } from "main/lib/window-registry/window-registry";
import { z } from "zod";
import { publicProcedure, router } from "../..";

// Full disks and permission walls on the user's state file are their
// environment, not bugs.
async function writeAppState(): Promise<void> {
	try {
		await appState.write();
	} catch (error) {
		const errno = (error as NodeJS.ErrnoException | null)?.code;
		if (errno === "ENOSPC" || errno === "EACCES" || errno === "EPERM") {
			throw new TRPCError({
				code: errno === "ENOSPC" ? "PRECONDITION_FAILED" : "FORBIDDEN",
				message: error instanceof Error ? error.message : String(error),
			});
		}
		throw error;
	}
}

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
	type: z.enum(["terminal", "webview", "file-viewer", "devtools"]),
	name: z.string(),
	isNew: z.boolean().optional(),
	status: z.enum(["idle", "working", "permission", "review"]).optional(),
	initialCwd: z.string().optional(),
	url: z.string().optional(),
	cwd: z.string().nullable().optional(),
	cwdConfirmed: z.boolean().optional(),
	fileViewer: fileViewerStateSchema.optional(),
	browser: z
		.object({
			currentUrl: z.string(),
			history: z.array(
				z.object({
					url: z.string(),
					title: z.string(),
					timestamp: z.number(),
					faviconUrl: z.string().optional(),
				}),
			),
			historyIndex: z.number(),
			isLoading: z.boolean(),
			viewport: z
				.object({
					name: z.string(),
					width: z.number(),
					height: z.number(),
				})
				.nullable()
				.optional(),
		})
		.optional(),
	devtools: z
		.object({
			targetPaneId: z.string(),
		})
		.optional(),
	workspaceRun: z
		.object({
			workspaceId: z.string(),
			state: z.enum(["running", "stopped-by-user", "stopped-by-exit"]),
		})
		.optional(),
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
	highlightMatch: z.string(),
	highlightActive: z.string(),
	highlight: z.string().optional(),
	highlightForeground: z.string().optional(),
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
 * Zod schema for editor/diff color + syntax overrides (Theme.editor).
 *
 * Persisted faithfully via record() so imported custom themes keep their
 * editor/diff syntax colors across reloads. Omitting this previously stripped
 * `editor` on save (Zod drops unknown keys), so on reload getEditorTheme fell
 * back to the derived terminal palette and diff/editor syntax lost its theme.
 */
const editorThemeSchema = z.object({
	colors: z.record(z.string(), z.string()).optional(),
	syntax: z.record(z.string(), z.string()).optional(),
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
	editor: editorThemeSchema.optional(),
	isBuiltIn: z.boolean().optional(),
	isCustom: z.boolean().optional(),
});

/**
 * Zod schema for ThemeState
 */
const themeStateSchema = z.object({
	activeThemeId: z.string(),
	customThemes: z.array(themeSchema),
	systemLightThemeId: z.string().optional(),
	systemDarkThemeId: z.string().optional(),
});

/**
 * UI State router - manages tabs and theme persistence via lowdb
 */
export const createUiStateRouter = () => {
	return router({
		// Tabs state procedures — scoped to the calling window. Each window is
		// its own renderer persisting its whole layout, so a single shared
		// record let the last writer win and made every window restore the same
		// layout. `ctx.senderWindow` resolves the window's persisted key.
		tabs: router({
			get: publicProcedure.query(({ ctx }): TabsState => {
				const key = ctx.senderWindow ? getKey(ctx.senderWindow.id) : null;
				if (!key) return appState.data.tabsState;
				// A window with no record yet inherits the pre-multi-window
				// layout, so an existing user's tabs survive the upgrade. Second
				// and later windows fall back to it too, which is the same thing
				// they did before this change.
				return (
					appState.data.tabsStateByWindow?.[key] ?? appState.data.tabsState
				);
			}),

			set: publicProcedure
				.input(tabsStateSchema)
				.mutation(async ({ ctx, input }) => {
					const key = ctx.senderWindow ? getKey(ctx.senderWindow.id) : null;
					if (key) {
						appState.data.tabsStateByWindow = {
							...appState.data.tabsStateByWindow,
							[key]: input,
						};
					} else {
						// No resolvable window (e.g. a <webview> guest): fall back to
						// the shared record rather than dropping the write.
						appState.data.tabsState = input;
					}
					await writeAppState();
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
					await writeAppState();
					return { success: true };
				}),
		}),

		// Legacy hotkeys state (read-only, for one-time migration to localStorage)
		hotkeys: router({
			get: publicProcedure.query(() => {
				return appState.data.hotkeysState;
			}),
		}),
	});
};
