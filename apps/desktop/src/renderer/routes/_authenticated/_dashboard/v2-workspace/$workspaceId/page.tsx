import { type PaneActionConfig, Workspace } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	CommandPalette,
	useCommandPalette,
} from "renderer/screens/main/components/CommandPalette";
import { PresetsBar } from "renderer/screens/main/components/WorkspaceView/ContentView/components/PresetsBar";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { AddTabMenu } from "./components/AddTabMenu";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
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
	const navigate = useNavigate();
	const { store } = useV2WorkspacePaneLayout({ projectId, workspaceId });
	const paneRegistry = usePaneRegistry(workspaceId);

	const utils = electronTrpc.useUtils();
	const { data: showPresetsBar, isLoading: isLoadingPresetsBar } =
		electronTrpc.settings.getShowPresetsBar.useQuery();
	const setShowPresetsBar = electronTrpc.settings.setShowPresetsBar.useMutation(
		{
			onMutate: async ({ enabled }) => {
				await utils.settings.getShowPresetsBar.cancel();
				const previous = utils.settings.getShowPresetsBar.getData();
				utils.settings.getShowPresetsBar.setData(undefined, enabled);
				return { previous };
			},
			onError: (_error, _variables, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getShowPresetsBar.setData(undefined, context.previous);
				}
			},
			onSettled: () => {
				utils.settings.getShowPresetsBar.invalidate();
			},
		},
	);

	const openFilePane = useCallback(
		(filePath: string) => {
			store.getState().openPane({
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
						sessionKey: `${workspaceId}:${crypto.randomUUID()}`,
						cwd: `/workspace/${workspaceName}`,
						launchMode: "workspace-shell",
					} as TerminalPaneData,
				},
			],
		});
	}, [store, workspaceId, workspaceName]);

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
						url: "http://localhost:3000",
						mode: "preview",
					} as BrowserPaneData,
				},
			],
		});
	}, [store]);

	const commandPalette = useCommandPalette({
		workspaceId,
		navigate,
		onSelectFile: ({ close, filePath, targetWorkspaceId }) => {
			close();
			if (targetWorkspaceId !== workspaceId) {
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: targetWorkspaceId },
				});
				return;
			}
			openFilePane(filePath);
		},
	});

	const handleQuickOpen = useCallback(() => {
		commandPalette.toggle();
	}, [commandPalette]);

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
				tooltip: (
					<HotkeyTooltipContent label="Split pane" hotkeyId="SPLIT_AUTO" />
				),
				onClick: (ctx) => {
					const position =
						ctx.pane.parentDirection === "horizontal" ? "down" : "right";
					ctx.actions.split(position, {
						kind: "terminal",
						data: {
							sessionKey: `${workspaceId}:${crypto.randomUUID()}`,
							cwd: `/workspace/${workspaceName}`,
							launchMode: "workspace-shell",
						} as TerminalPaneData,
					});
				},
			},
			{
				key: "close",
				icon: <HiMiniXMark className="size-3.5" />,
				tooltip: (
					<HotkeyTooltipContent label="Close pane" hotkeyId="CLOSE_TERMINAL" />
				),
				onClick: (ctx) => ctx.actions.close(),
			},
		],
		[workspaceId, workspaceName],
	);

	useAppHotkey("NEW_GROUP", addTerminalTab, undefined, [addTerminalTab]);
	useAppHotkey("NEW_CHAT", addChatTab, undefined, [addChatTab]);
	useAppHotkey("NEW_BROWSER", addBrowserTab, undefined, [addBrowserTab]);
	useAppHotkey("QUICK_OPEN", handleQuickOpen, undefined, [handleQuickOpen]);

	return (
		<>
			<div
				className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
				data-workspace-id={workspaceId}
			>
				{!isLoadingPresetsBar && showPresetsBar ? <PresetsBar /> : null}
				<Workspace<PaneViewerData>
					registry={paneRegistry}
					paneActions={defaultPaneActions}
					renderAddTabMenu={() => (
						<AddTabMenu
							onAddTerminal={addTerminalTab}
							onAddChat={addChatTab}
							onAddBrowser={addBrowserTab}
							showPresetsBar={showPresetsBar ?? false}
							onTogglePresetsBar={(enabled) =>
								setShowPresetsBar.mutate({ enabled })
							}
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
					store={store}
				/>
			</div>
			<CommandPalette
				excludePattern={commandPalette.excludePattern}
				filtersOpen={commandPalette.filtersOpen}
				includePattern={commandPalette.includePattern}
				isLoading={commandPalette.isFetching}
				onExcludePatternChange={commandPalette.setExcludePattern}
				onFiltersOpenChange={commandPalette.setFiltersOpen}
				onIncludePatternChange={commandPalette.setIncludePattern}
				onOpenChange={commandPalette.handleOpenChange}
				onQueryChange={commandPalette.setQuery}
				onScopeChange={commandPalette.setScope}
				onSelectFile={commandPalette.selectFile}
				open={commandPalette.open}
				query={commandPalette.query}
				scope={commandPalette.scope}
				searchResults={commandPalette.searchResults}
				workspaceName={workspaceName}
			/>
		</>
	);
}
