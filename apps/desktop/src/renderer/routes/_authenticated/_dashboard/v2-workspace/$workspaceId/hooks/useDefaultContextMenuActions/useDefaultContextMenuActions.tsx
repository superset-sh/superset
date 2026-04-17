import {
	type ContextMenuActionConfig,
	type PaneRegistry,
	type RendererContext,
	resolveTabTitle,
} from "@superset/panes";
import { useMemo } from "react";
import {
	LuColumns2,
	LuEqual,
	LuGlobe,
	LuMessageSquare,
	LuMoveRight,
	LuPlus,
	LuRows2,
	LuX,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import type {
	BrowserPaneData,
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

export function useDefaultContextMenuActions(
	paneRegistry: PaneRegistry<PaneViewerData>,
): ContextMenuActionConfig<PaneViewerData>[] {
	const splitDownShortcut = useHotkeyDisplay("SPLIT_DOWN").text;
	const splitRightShortcut = useHotkeyDisplay("SPLIT_RIGHT").text;
	const splitWithChatShortcut = useHotkeyDisplay("SPLIT_WITH_CHAT").text;
	const splitWithBrowserShortcut = useHotkeyDisplay("SPLIT_WITH_BROWSER").text;
	const equalizePaneSplitsShortcut = useHotkeyDisplay(
		"EQUALIZE_PANE_SPLITS",
	).text;
	const closePaneShortcut = useHotkeyDisplay("CLOSE_PANE").text;

	return useMemo<ContextMenuActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "split-horizontal",
				label: "Split Horizontally",
				icon: <LuRows2 />,
				shortcut:
					splitDownShortcut !== "Unassigned" ? splitDownShortcut : undefined,
				onSelect: (ctx) => {
					ctx.actions.split("down", {
						kind: "terminal",
						data: {
							terminalId: crypto.randomUUID(),
						} as TerminalPaneData,
					});
				},
			},
			{
				key: "split-vertical",
				label: "Split Vertically",
				icon: <LuColumns2 />,
				shortcut:
					splitRightShortcut !== "Unassigned" ? splitRightShortcut : undefined,
				onSelect: (ctx) => {
					ctx.actions.split("right", {
						kind: "terminal",
						data: {
							terminalId: crypto.randomUUID(),
						} as TerminalPaneData,
					});
				},
			},
			{
				key: "split-with-chat",
				label: "Split with New Chat",
				icon: <LuMessageSquare />,
				shortcut:
					splitWithChatShortcut !== "Unassigned"
						? splitWithChatShortcut
						: undefined,
				onSelect: (ctx) => {
					ctx.actions.split("right", {
						kind: "chat",
						data: { sessionId: null } as ChatPaneData,
					});
				},
			},
			{
				key: "split-with-browser",
				label: "Split with New Browser",
				icon: <LuGlobe />,
				shortcut:
					splitWithBrowserShortcut !== "Unassigned"
						? splitWithBrowserShortcut
						: undefined,
				onSelect: (ctx) => {
					ctx.actions.split("right", {
						kind: "browser",
						data: {
							url: "about:blank",
						} as BrowserPaneData,
					});
				},
			},
			{
				key: "equalize-splits",
				label: "Equalize Pane Splits",
				icon: <LuEqual />,
				shortcut:
					equalizePaneSplitsShortcut !== "Unassigned"
						? equalizePaneSplitsShortcut
						: undefined,
				onSelect: (ctx) => {
					ctx.store.getState().equalizeTab({ tabId: ctx.tab.id });
				},
			},
			{ key: "sep-move", type: "separator" },
			{
				key: "move-to-tab",
				label: "Move to Tab",
				icon: <LuMoveRight />,
				children: (ctx: RendererContext<PaneViewerData>) => {
					const tabs = ctx.store.getState().tabs;
					const otherTabs = tabs.filter((t) => t.id !== ctx.tab.id);
					const items: ContextMenuActionConfig<PaneViewerData>[] =
						otherTabs.map((tab) => ({
							key: `move-to-${tab.id}`,
							label: resolveTabTitle(tab, tabs, paneRegistry),
							onSelect: () => {
								ctx.store
									.getState()
									.movePaneToTab({ paneId: ctx.pane.id, targetTabId: tab.id });
							},
						}));
					if (otherTabs.length > 0) {
						items.push({ key: "sep-new-tab", type: "separator" });
					}
					items.push({
						key: "move-to-new-tab",
						label: "New Tab",
						icon: <LuPlus />,
						onSelect: () => {
							ctx.store.getState().movePaneToNewTab({ paneId: ctx.pane.id });
						},
					});
					return items;
				},
			},
			{ key: "sep-close", type: "separator" },
			{
				key: "close-pane",
				label: "Close Pane",
				icon: <LuX />,
				variant: "destructive",
				shortcut:
					closePaneShortcut !== "Unassigned" ? closePaneShortcut : undefined,
				onSelect: (ctx) => ctx.actions.close(),
			},
		],
		[
			splitDownShortcut,
			splitRightShortcut,
			splitWithChatShortcut,
			splitWithBrowserShortcut,
			equalizePaneSplitsShortcut,
			closePaneShortcut,
			paneRegistry,
		],
	);
}
