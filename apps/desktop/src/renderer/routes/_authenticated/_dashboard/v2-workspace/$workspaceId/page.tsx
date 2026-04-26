import { Workspace } from "@superset/panes";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkey } from "renderer/hotkeys";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import { WorkspaceNotFoundState } from "../components/WorkspaceNotFoundState";
import { AddTabMenu } from "./components/AddTabMenu";
import { V2NotificationStatusIndicator } from "./components/V2NotificationStatusIndicator";
import { V2PresetsBar } from "./components/V2PresetsBar";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useBrowserShellInteractionPassthrough } from "./hooks/useBrowserShellInteractionPassthrough";
import { useClearActivePaneAttention } from "./hooks/useClearActivePaneAttention";
import { useConsumeAutomationRunLink } from "./hooks/useConsumeAutomationRunLink";
import { useConsumeOpenUrlRequest } from "./hooks/useConsumeOpenUrlRequest";
import { useConsumePendingLaunch } from "./hooks/useConsumePendingLaunch";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { useDefaultPaneActions } from "./hooks/useDefaultPaneActions";
import { useDirtyTabCloseGuard } from "./hooks/useDirtyTabCloseGuard";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { renderBrowserTabIcon } from "./hooks/usePaneRegistry/components/BrowserPane";
import { useV2PresetExecution } from "./hooks/useV2PresetExecution";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import { useWorkspaceFileNavigation } from "./hooks/useWorkspaceFileNavigation";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import { useWorkspacePaneOpeners } from "./hooks/useWorkspacePaneOpeners";
import { FileDocumentStoreProvider } from "./state/fileDocumentStore";
import type { PaneViewerData } from "./types";
import type { V2WorkspaceUrlOpenTarget } from "./utils/openUrlInV2Workspace";

interface WorkspaceSearch {
	terminalId?: string;
	chatSessionId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: V2WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}

function parseOpenUrlTarget(
	value: unknown,
): V2WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
	validateSearch: (raw: Record<string, unknown>): WorkspaceSearch => ({
		terminalId: parseNonEmptyString(raw.terminalId),
		chatSessionId: parseNonEmptyString(raw.chatSessionId),
		focusRequestId: parseNonEmptyString(raw.focusRequestId),
		openUrl: parseNonEmptyString(raw.openUrl),
		openUrlTarget: parseOpenUrlTarget(raw.openUrlTarget),
		openUrlRequestId: parseNonEmptyString(raw.openUrlRequestId),
	}),
});

function V2WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const {
		terminalId,
		chatSessionId,
		focusRequestId,
		openUrl,
		openUrlTarget,
		openUrlRequestId,
	} = Route.useSearch();
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
			terminalId={terminalId}
			chatSessionId={chatSessionId}
			focusRequestId={focusRequestId}
			openUrl={openUrl}
			openUrlTarget={openUrlTarget}
			openUrlRequestId={openUrlRequestId}
		/>
	);
}

function WorkspaceContent({
	projectId,
	workspaceId,
	workspaceName,
	terminalId,
	chatSessionId,
	focusRequestId,
	openUrl,
	openUrlTarget,
	openUrlRequestId,
}: {
	projectId: string;
	workspaceId: string;
	workspaceName: string;
	terminalId?: string;
	chatSessionId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: V2WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}) {
	const {
		preferences: v2UserPreferences,
		setRightSidebarOpen,
		setRightSidebarTab,
	} = useV2UserPreferences();
	const { store } = useV2WorkspacePaneLayout({
		projectId,
		workspaceId,
	});
	useClearActivePaneAttention({ workspaceId, store });
	const { matchedPresets, executePreset } = useV2PresetExecution({
		store,
		workspaceId,
		projectId,
	});
	useConsumePendingLaunch({ workspaceId, store });
	useConsumeAutomationRunLink({
		store,
		terminalId,
		chatSessionId,
		focusRequestId,
	});
	useConsumeOpenUrlRequest({
		store,
		url: openUrl,
		target: openUrlTarget,
		requestId: openUrlRequestId,
	});

	const {
		openFilePane,
		revealPath,
		selectedFilePath,
		pendingReveal,
		recentFiles,
		openFilePaths,
	} = useWorkspaceFileNavigation({
		workspaceId,
		store,
		setRightSidebarOpen,
		setRightSidebarTab,
	});

	const paneRegistry = usePaneRegistry(workspaceId, {
		onOpenFile: openFilePane,
		onRevealPath: revealPath,
	});
	const defaultContextMenuActions = useDefaultContextMenuActions(paneRegistry);
	const {
		openDiffPane,
		addTerminalTab,
		addChatTab,
		addBrowserTab,
		openCommentPane,
	} = useWorkspacePaneOpeners({ store });

	const [quickOpenOpen, setQuickOpenOpen] = useState(false);
	const handleQuickOpen = useCallback(() => setQuickOpenOpen(true), []);
	const defaultPaneActions = useDefaultPaneActions();
	const onBeforeCloseTab = useDirtyTabCloseGuard({ workspaceId });

	const sidebarOpen = v2UserPreferences.rightSidebarOpen;
	const { onSidebarResizeDragging, onWorkspaceInteractionStateChange } =
		useBrowserShellInteractionPassthrough({ sidebarOpen });

	useWorkspaceHotkeys({
		store,
		matchedPresets,
		executePreset,
		paneRegistry,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);

	return (
		<FileDocumentStoreProvider workspaceId={workspaceId}>
			<ResizablePanelGroup
				direction="horizontal"
				className="min-h-0 min-w-0 flex-1 overflow-auto"
			>
				<ResizablePanel className="min-w-[320px]" defaultSize={80} minSize={30}>
					<div
						className="flex min-h-0 min-w-0 h-full flex-col overflow-hidden"
						data-workspace-id={workspaceId}
					>
						<Workspace<PaneViewerData>
							registry={paneRegistry}
							paneActions={defaultPaneActions}
							contextMenuActions={defaultContextMenuActions}
							renderTabIcon={renderBrowserTabIcon}
							renderTabAccessory={(tab) => (
								<V2NotificationStatusIndicator
									workspaceId={workspaceId}
									sources={getV2NotificationSourcesForTab(tab)}
								/>
							)}
							renderBelowTabBar={() => (
								<V2PresetsBar
									matchedPresets={matchedPresets}
									executePreset={executePreset}
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
							onBeforeCloseTab={onBeforeCloseTab}
							onInteractionStateChange={onWorkspaceInteractionStateChange}
							store={store}
						/>
					</div>
				</ResizablePanel>
				{sidebarOpen && (
					<>
						<ResizableHandle onDragging={onSidebarResizeDragging} />
						<ResizablePanel
							className="min-w-[220px]"
							defaultSize={20}
							minSize={15}
							maxSize={40}
						>
							<WorkspaceSidebar
								workspaceId={workspaceId}
								workspaceName={workspaceName}
								onSelectFile={openFilePane}
								onSelectDiffFile={openDiffPane}
								onOpenComment={openCommentPane}
								onSearch={handleQuickOpen}
								selectedFilePath={selectedFilePath}
								pendingReveal={pendingReveal}
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
				recentlyViewedFiles={recentFiles}
				openFilePaths={openFilePaths}
			/>
		</FileDocumentStoreProvider>
	);
}
