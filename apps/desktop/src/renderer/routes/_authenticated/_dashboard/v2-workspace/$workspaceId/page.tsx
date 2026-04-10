import type { Tab } from "@superset/panes";
import { type PaneActionConfig, Workspace } from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { HotkeyLabel, useHotkey } from "renderer/hotkeys";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { useStore } from "zustand";
import { AddTabMenu } from "./components/AddTabMenu";
import { V2PresetsBar } from "./components/V2PresetsBar";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { browserRuntimeRegistry } from "./hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { BrowserTabLabel } from "./hooks/usePaneRegistry/components/BrowserPane/components/BrowserTabLabel";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import type {
	BrowserPaneData,
	ChatPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "./types";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
});

function V2WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const collections = useCollections();

	const { data: workspaces } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces?.[0] ?? null;

	if (!workspaces) {
		return <div className="flex h-full w-full" />;
	}

	if (!workspace) {
		return <WorkspaceNotFoundState workspaceId={workspaceId} />;
	}

	return (
		<WorkspaceContent
			projectId={workspace.projectId}
			workspaceId={workspace.id}
			workspaceName={workspace.name}
		/>
	);
}

function WorkspaceContent({
	projectId,
	workspaceId,
	workspaceName,
}: {
	projectId: string;
	workspaceId: string;
	workspaceName: string;
}) {
	const { localWorkspaceState, store } = useV2WorkspacePaneLayout({
		projectId,
		workspaceId,
	});
	const paneRegistry = usePaneRegistry(workspaceId);
	const defaultContextMenuActions = useDefaultContextMenuActions();

	const selectedFilePath = useStore(store, (s) => {
		const tab = s.tabs.find((t) => t.id === s.activeTabId);
		if (!tab?.activePaneId) return undefined;
		const pane = tab.panes[tab.activePaneId];
		if (pane?.kind === "file") return (pane.data as FilePaneData).filePath;
		return undefined;
	});

	const openFilePane = useCallback(
		(filePath: string) => {
			const state = store.getState();
			const active = state.getActivePane();
			if (
				active?.pane.kind === "file" &&
				(active.pane.data as FilePaneData).filePath === filePath
			) {
				state.setPanePinned({ paneId: active.pane.id, pinned: true });
				return;
			}
			state.openPane({
				pane: {
					kind: "file",
					data: {
						filePath,
						mode: "editor",
						hasChanges: false,
					} as FilePaneData,
				},
				tabTitle: "Files",
			});
		},
		[store],
	);

	const addTerminalTab = useCallback(() => {
		store.getState().addTab({
			titleOverride: "Terminal",
			panes: [
				{
					kind: "terminal",
					data: {
						terminalId: crypto.randomUUID(),
					} as TerminalPaneData,
				},
			],
		});
	}, [store]);

	const addChatTab = useCallback(() => {
		store.getState().addTab({
			titleOverride: "Chat",
			panes: [
				{
					kind: "chat",
					data: { sessionId: null } as ChatPaneData,
				},
			],
		});
	}, [store]);

	const addBrowserTab = useCallback(() => {
		store.getState().addTab({
			titleOverride: "Browser",
			panes: [
				{
					kind: "browser",
					data: {
						url: "about:blank",
					} as BrowserPaneData,
				},
			],
		});
	}, [store]);

	const [quickOpenOpen, setQuickOpenOpen] = useState(false);
	const handleQuickOpen = useCallback(() => setQuickOpenOpen(true), []);

	const getSingleBrowserPaneId = useCallback(
		(tab: Tab<PaneViewerData>): string | null => {
			const paneIds = Object.keys(tab.panes);
			if (paneIds.length !== 1) return null;
			const pane = tab.panes[paneIds[0]];
			return pane.kind === "browser" ? pane.id : null;
		},
		[],
	);

	const getTabTitle = useCallback(
		(tab: Tab<PaneViewerData>): string => {
			const browserPaneId = getSingleBrowserPaneId(tab);
			if (!browserPaneId) return tab.titleOverride ?? tab.id;
			const state = browserRuntimeRegistry.getState(browserPaneId);
			if (state.pageTitle) return state.pageTitle;
			if (state.currentUrl && state.currentUrl !== "about:blank") {
				try {
					return new URL(state.currentUrl).hostname;
				} catch {}
			}
			return tab.titleOverride ?? "Browser";
		},
		[getSingleBrowserPaneId],
	);

	const renderTabLabel = useCallback(
		(tab: Tab<PaneViewerData>) => {
			const browserPaneId = getSingleBrowserPaneId(tab);
			if (!browserPaneId) return null;
			return (
				<BrowserTabLabel
					paneId={browserPaneId}
					fallbackTitle={tab.titleOverride ?? "Browser"}
				/>
			);
		},
		[getSingleBrowserPaneId],
	);

	const browserPaneIdsRef = useRef<Set<string>>(new Set());
	const tabsFromStore = useStore(store, (s) => s.tabs);
	useEffect(() => {
		const current = new Set<string>();
		for (const tab of tabsFromStore) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind === "browser") current.add(pane.id);
			}
		}
		for (const prevId of browserPaneIdsRef.current) {
			if (!current.has(prevId)) {
				browserRuntimeRegistry.destroy(prevId);
			}
		}
		browserPaneIdsRef.current = current;
	}, [tabsFromStore]);

	const defaultPaneActions = useMemo<PaneActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "split",
				icon: (ctx) =>
					ctx.pane.parentDirection === "horizontal" ? (
						<TbLayoutRows className="size-3.5" />
					) : (
						<TbLayoutColumns className="size-3.5" />
					),
				tooltip: <HotkeyLabel label="Split pane" id="SPLIT_AUTO" />,
				onClick: (ctx) => {
					const position =
						ctx.pane.parentDirection === "horizontal" ? "down" : "right";
					ctx.actions.split(position, {
						kind: "terminal",
						data: {
							terminalId: crypto.randomUUID(),
						} as TerminalPaneData,
					});
				},
			},
			{
				key: "close",
				icon: <HiMiniXMark className="size-3.5" />,
				tooltip: <HotkeyLabel label="Close pane" id="CLOSE_TERMINAL" />,
				onClick: (ctx) => ctx.actions.close(),
			},
		],
		[],
	);

	const sidebarOpen = localWorkspaceState?.rightSidebarOpen ?? false;

	useWorkspaceHotkeys({ store, workspaceId });
	useHotkey("QUICK_OPEN", handleQuickOpen);

	return (
		<>
			<ResizablePanelGroup direction="horizontal" className="flex-1">
				<ResizablePanel defaultSize={80} minSize={30}>
					<div
						className="flex min-h-0 min-w-0 h-full flex-col overflow-hidden"
						data-workspace-id={workspaceId}
					>
						<Workspace<PaneViewerData>
							registry={paneRegistry}
							paneActions={defaultPaneActions}
							contextMenuActions={defaultContextMenuActions}
							getTabTitle={getTabTitle}
							renderTabLabel={renderTabLabel}
							renderBelowTabBar={() => (
								<V2PresetsBar
									workspaceId={workspaceId}
									projectId={projectId}
									store={store}
								/>
							)}
							renderAddTabMenu={() => (
								<AddTabMenu
									onAddTerminal={addTerminalTab}
									onAddChat={addChatTab}
									onAddBrowser={addBrowserTab}
								/>
							)}
							renderEmptyState={() => (
								<WorkspaceEmptyState
									onOpenBrowser={addBrowserTab}
									onOpenChat={addChatTab}
									onOpenQuickOpen={handleQuickOpen}
									onOpenTerminal={addTerminalTab}
								/>
							)}
							onBeforeCloseTab={(tab) => {
								const dirtyFiles = Object.values(tab.panes)
									.filter(
										(p) =>
											p.kind === "file" && (p.data as FilePaneData).hasChanges,
									)
									.map((p) =>
										(p.data as FilePaneData).filePath.split("/").pop(),
									);
								if (dirtyFiles.length === 0) return true;
								const title =
									dirtyFiles.length === 1
										? `Do you want to save the changes you made to ${dirtyFiles[0]}?`
										: `Do you want to save changes to ${dirtyFiles.length} files?`;
								return new Promise<boolean>((resolve) => {
									alert({
										title,
										description:
											"Your changes will be lost if you don't save them.",
										actions: [
											{
												label: "Save All",
												onClick: () => {
													// TODO: wire up save via editor refs
													resolve(true);
												},
											},
											{
												label: "Don't Save",
												variant: "secondary",
												onClick: () => resolve(true),
											},
											{
												label: "Cancel",
												variant: "ghost",
												onClick: () => resolve(false),
											},
										],
									});
								});
							}}
							store={store}
						/>
					</div>
				</ResizablePanel>
				{sidebarOpen && (
					<>
						<ResizableHandle />
						<ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
							<WorkspaceSidebar
								workspaceId={workspaceId}
								workspaceName={workspaceName}
								onSelectFile={openFilePane}
								onSearch={handleQuickOpen}
								selectedFilePath={selectedFilePath}
							/>
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>
			<CommandPalette
				workspaceId={workspaceId}
				open={quickOpenOpen}
				onOpenChange={setQuickOpenOpen}
				onSelectFile={openFilePane}
				variant="v2"
			/>
		</>
	);
}
