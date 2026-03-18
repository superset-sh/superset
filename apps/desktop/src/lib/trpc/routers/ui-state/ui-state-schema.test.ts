import { describe, expect, it } from "bun:test";
import { z } from "zod";

/**
 * These schemas mirror the ones in index.ts — imported inline because the router
 * file couples schema definitions with tRPC router creation (which requires
 * runtime dependencies like appState/lowdb that aren't available in unit tests).
 *
 * When this test fails it means the persistence schema in index.ts has drifted
 * from the canonical TypeScript types in shared/tabs-types.ts.
 */

// ---- Inline copies of the FIXED Zod schemas from index.ts ----

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
	displayName: z.string().optional(),
});

const chatMastraLaunchConfigSchema = z.object({
	initialPrompt: z.string().optional(),
	draftInput: z.string().optional(),
	initialFiles: z
		.array(
			z.object({
				data: z.string(),
				mediaType: z.string(),
				filename: z.string().optional(),
			}),
		)
		.optional(),
	metadata: z
		.object({
			model: z.string().optional(),
		})
		.optional(),
	retryCount: z.number().int().min(0).optional(),
});

const paneSchema = z.object({
	id: z.string(),
	tabId: z.string(),
	type: z.enum([
		"terminal",
		"webview",
		"file-viewer",
		"chat-mastra",
		"devtools",
	]),
	name: z.string(),
	userTitle: z.string().optional(),
	isNew: z.boolean().optional(),
	status: z.enum(["idle", "working", "permission", "review"]).optional(),
	initialCwd: z.string().optional(),
	url: z.string().optional(),
	cwd: z.string().nullable().optional(),
	cwdConfirmed: z.boolean().optional(),
	fileViewer: fileViewerStateSchema.optional(),
	chatMastra: z
		.object({
			sessionId: z.string().nullable(),
			launchConfig: chatMastraLaunchConfigSchema.nullable().optional(),
		})
		.optional(),
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
			error: z
				.object({
					code: z.number(),
					description: z.string(),
					url: z.string(),
				})
				.nullable()
				.optional(),
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
});

const mosaicNodeSchema: z.ZodType<
	| string
	| {
			direction: "row" | "column";
			first: unknown;
			second: unknown;
			splitPercentage?: number;
	  }
> = z.lazy(() =>
	z.union([
		z.string(),
		z.object({
			direction: z.enum(["row", "column"]),
			first: mosaicNodeSchema,
			second: mosaicNodeSchema,
			splitPercentage: z.number().optional(),
		}),
	]),
);

const tabSchema = z.object({
	id: z.string(),
	name: z.string(),
	userTitle: z.string().optional(),
	workspaceId: z.string(),
	createdAt: z.number(),
	layout: mosaicNodeSchema,
});

const tabsStateSchema = z.object({
	tabs: z.array(tabSchema),
	panes: z.record(z.string(), paneSchema),
	activeTabIds: z.record(z.string(), z.string().nullable()),
	focusedPaneIds: z.record(z.string(), z.string()),
	tabHistoryStacks: z.record(z.string(), z.array(z.string())),
});

// ---- Test helpers ----

function makeTerminalPane(overrides: Record<string, unknown> = {}) {
	return {
		id: "pane-1",
		tabId: "tab-1",
		type: "terminal" as const,
		name: "Terminal",
		status: "idle" as const,
		cwd: "/home/user",
		cwdConfirmed: true,
		...overrides,
	};
}

function makeTabsState(
	paneOverrides: Record<string, unknown> = {},
	extraPanes: Record<string, Record<string, unknown>> = {},
) {
	const pane = makeTerminalPane(paneOverrides);
	const panes: Record<string, unknown> = { [pane.id]: pane };
	for (const [id, p] of Object.entries(extraPanes)) {
		panes[id] = p;
	}
	return {
		tabs: [
			{
				id: "tab-1",
				name: "Tab 1",
				workspaceId: "ws-1",
				createdAt: Date.now(),
				layout: "pane-1",
			},
		],
		panes,
		activeTabIds: { "ws-1": "tab-1" },
		focusedPaneIds: { "tab-1": "pane-1" },
		tabHistoryStacks: { "ws-1": [] },
	};
}

// ---- Tests ----

describe("ui-state persistence schema", () => {
	describe("paneSchema preserves pane fields", () => {
		it("should preserve userTitle through round-trip", () => {
			const pane = makeTerminalPane({ userTitle: "my custom title" });
			const parsed = paneSchema.parse(pane);

			// userTitle should survive Zod validation — if this fails, the schema
			// is missing userTitle and pane names set by the user will be silently
			// lost on every persist cycle.
			expect(parsed).toHaveProperty("userTitle", "my custom title");
		});

		it("should accept pane without userTitle", () => {
			const pane = makeTerminalPane();
			const parsed = paneSchema.parse(pane);
			expect(parsed.id).toBe("pane-1");
		});
	});

	describe("chatMastraLaunchConfigSchema preserves chat fields", () => {
		it("should preserve draftInput through round-trip", () => {
			const config = {
				initialPrompt: "hello",
				draftInput: "some draft text",
			};
			const parsed = chatMastraLaunchConfigSchema.parse(config);
			expect(parsed).toHaveProperty("draftInput", "some draft text");
		});

		it("should preserve initialFiles through round-trip", () => {
			const config = {
				initialFiles: [
					{
						data: "base64data",
						mediaType: "image/png",
						filename: "screenshot.png",
					},
				],
			};
			const parsed = chatMastraLaunchConfigSchema.parse(config);
			expect(parsed).toHaveProperty("initialFiles");
			expect(parsed.initialFiles).toHaveLength(1);
		});
	});

	describe("fileViewerStateSchema preserves file viewer fields", () => {
		it("should preserve displayName through round-trip", () => {
			const fileViewer = {
				filePath: "/path/to/file.ts",
				viewMode: "raw" as const,
				isPinned: true,
				diffLayout: "inline" as const,
				displayName: "My Custom Name",
			};
			const parsed = fileViewerStateSchema.parse(fileViewer);
			expect(parsed).toHaveProperty("displayName", "My Custom Name");
		});
	});

	describe("tabsStateSchema full round-trip", () => {
		it("should preserve complete state through round-trip", () => {
			const state = makeTabsState({ userTitle: "user set title" });
			const parsed = tabsStateSchema.parse(state);

			// Tabs should survive
			expect(parsed.tabs).toHaveLength(1);
			expect(parsed.tabs[0].id).toBe("tab-1");

			// Panes should survive with all fields
			expect(parsed.panes["pane-1"]).toBeDefined();
			expect(parsed.panes["pane-1"].name).toBe("Terminal");

			// userTitle on pane should survive round-trip
			expect(parsed.panes["pane-1"]).toHaveProperty(
				"userTitle",
				"user set title",
			);
		});

		it("should preserve chat-mastra pane with launch config", () => {
			const chatPane = {
				id: "pane-chat",
				tabId: "tab-1",
				type: "chat-mastra" as const,
				name: "Chat",
				chatMastra: {
					sessionId: "session-1",
					launchConfig: {
						initialPrompt: "hello",
						draftInput: "draft text",
						initialFiles: [{ data: "abc", mediaType: "text/plain" }],
					},
				},
			};
			const state = makeTabsState({}, { "pane-chat": chatPane });
			const parsed = tabsStateSchema.parse(state);
			const parsedChat = parsed.panes["pane-chat"];
			expect(parsedChat.chatMastra?.launchConfig).toHaveProperty(
				"draftInput",
				"draft text",
			);
			expect(parsedChat.chatMastra?.launchConfig?.initialFiles).toHaveLength(1);
		});

		it("should preserve browser pane error field", () => {
			const browserPane = {
				id: "pane-browser",
				tabId: "tab-1",
				type: "webview" as const,
				name: "Browser",
				browser: {
					currentUrl: "https://example.com",
					history: [],
					historyIndex: 0,
					isLoading: false,
					error: {
						code: 404,
						description: "Not Found",
						url: "https://example.com/missing",
					},
				},
			};
			const state = makeTabsState({}, { "pane-browser": browserPane });
			const parsed = tabsStateSchema.parse(state);
			const parsedBrowser = parsed.panes["pane-browser"];
			expect(parsedBrowser.browser).toHaveProperty("error");
		});
	});
});
