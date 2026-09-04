import { useLingui } from "@lingui/react/macro";
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
	LuMonitor,
	LuMoveRight,
	LuPlus,
	LuRows2,
	LuX,
} from "react-icons/lu";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type {
	BrowserPaneData,
	DesktopPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { useDefaultBrowserUrl } from "../useDefaultBrowserUrl";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useDefaultContextMenuActions({
	paneRegistry,
	launcher,
}: {
	paneRegistry: PaneRegistry<PaneViewerData>;
	launcher: TerminalLauncher;
}): ContextMenuActionConfig<PaneViewerData>[] {
	const { t } = useLingui();
	const splitDownShortcut = useHotkeyDisplay("SPLIT_DOWN").text;
	const splitRightShortcut = useHotkeyDisplay("SPLIT_RIGHT").text;
	const splitWithBrowserShortcut = useHotkeyDisplay("SPLIT_WITH_BROWSER").text;
	const equalizePaneSplitsShortcut = useHotkeyDisplay(
		"EQUALIZE_PANE_SPLITS",
	).text;
	const closePaneShortcut = useHotkeyDisplay("CLOSE_PANE").text;
	const defaultBrowserUrl = useDefaultBrowserUrl();
	const { workspace } = useWorkspace();
	const host = useWorkspaceHostTarget(workspace.id);
	const isSandbox = host.status === "ready" && host.kind === "sandbox";

	return useMemo<ContextMenuActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "split-horizontal",
				label: t({
					message: "Split Horizontally",
				}),
				icon: <LuRows2 />,
				shortcut:
					splitDownShortcut !== "Unassigned" ? splitDownShortcut : undefined,
				onSelect: (ctx) => {
					ctx.actions.split("down", {
						kind: "terminal",
						data: {
							terminalId: launcher.mint(),
							createOnAttach: true,
						} as TerminalPaneData,
					});
				},
			},
			{
				key: "split-vertical",
				label: t({
					message: "Split Vertically",
				}),
				icon: <LuColumns2 />,
				shortcut:
					splitRightShortcut !== "Unassigned" ? splitRightShortcut : undefined,
				onSelect: (ctx) => {
					ctx.actions.split("right", {
						kind: "terminal",
						data: {
							terminalId: launcher.mint(),
							createOnAttach: true,
						} as TerminalPaneData,
					});
				},
			},
			{
				key: "split-with-browser",
				label: t({
					message: "Split with New Browser",
				}),
				icon: <LuGlobe />,
				shortcut:
					splitWithBrowserShortcut !== "Unassigned"
						? splitWithBrowserShortcut
						: undefined,
				onSelect: (ctx) => {
					ctx.actions.split("right", {
						kind: "browser",
						data: {
							url: defaultBrowserUrl,
						} as BrowserPaneData,
					});
				},
			},
			...(isSandbox
				? [
						{
							key: "split-with-desktop",
							label: t({
								message: "Split with Desktop",
							}),
							icon: <LuMonitor />,
							onSelect: (ctx) => {
								ctx.actions.split("right", {
									kind: "desktop",
									data: { kind: "desktop" } as DesktopPaneData,
								});
							},
						} satisfies ContextMenuActionConfig<PaneViewerData>,
					]
				: []),
			{
				key: "equalize-splits",
				label: t({
					message: "Equalize Pane Splits",
				}),
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
				label: t({
					message: "Move to Tab",
				}),
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
						label: t({
							message: "New Tab",
						}),
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
				label: t({
					message: "Close Pane",
				}),
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
			splitWithBrowserShortcut,
			equalizePaneSplitsShortcut,
			closePaneShortcut,
			paneRegistry,
			launcher,
			defaultBrowserUrl,
			t,
			isSandbox,
		],
	);
}
