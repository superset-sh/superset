import { Workspace } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen/quickOpenStore";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkey } from "renderer/hotkeys";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { AddTabMenu } from "./components/AddTabMenu";
import { BackgroundTerminalsButton } from "./components/BackgroundTerminalsButton";
import { V2NotificationStatusIndicator } from "./components/V2NotificationStatusIndicator";
import { V2PresetsBar } from "./components/V2PresetsBar";
import { V2WorkspaceRunButton } from "./components/V2WorkspaceRunButton";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceMissingWorktreeState } from "./components/WorkspaceMissingWorktreeState";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useAutoAdoptBackgroundSessions } from "./hooks/useAutoAdoptBackgroundSessions";
import { useBrowserShellInteractionPassthrough } from "./hooks/useBrowserShellInteractionPassthrough";
import { useClearActivePaneAttention } from "./hooks/useClearActivePaneAttention";
import { useConsumeAutomationRunLink } from "./hooks/useConsumeAutomationRunLink";
import { useConsumeOpenUrlRequest } from "./hooks/useConsumeOpenUrlRequest";
import { useCreatePendingMigratedTerminals } from "./hooks/useCreatePendingMigratedTerminals";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { useDefaultPaneActions } from "./hooks/useDefaultPaneActions";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { renderBrowserTabIcon } from "./hooks/usePaneRegistry/components/BrowserPane";
import { useSlotElement } from "./hooks/useSlotElement";
import { useTabCloseGuard } from "./hooks/useTabCloseGuard";
import { useV2PresetExecution } from "./hooks/useV2PresetExecution";
import { useV2TerminalLauncher } from "./hooks/useV2TerminalLauncher";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import { useV2WorkspaceRun } from "./hooks/useV2WorkspaceRun";
import { useWorkspaceFileNavigation } from "./hooks/useWorkspaceFileNavigation";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import { useWorkspacePaneOpeners } from "./hooks/useWorkspacePaneOpeners";
import { WorkspaceGitStatusProvider } from "./providers/WorkspaceGitStatusProvider";
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
	const { workspace } = useWorkspace();
	const workspaceStatusQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspace.id },
		{
			refetchOnWindowFocus: true,
			retry: false,
		},
	);

	if (workspaceStatusQuery.data?.worktreeExists === false) {
		return (
			<WorkspaceMissingWorktreeState
				workspaceId={workspace.id}
				workspaceName={workspace.name}
				branch={workspace.branch}
				worktreePath={workspaceStatusQuery.data?.worktreePath}
				onRefresh={() => {
					void workspaceStatusQuery.refetch();
				}}
				isRefreshing={workspaceStatusQuery.isFetching}
			/>
		);
	}

	return <V2WorkspaceContent />;
}

function V2WorkspaceContent() {
	const {
		terminalId,
		chatSessionId,
		focusRequestId,
		openUrl,
		openUrlTarget,
		openUrlRequestId,
	} = Route.useSearch();
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;

	const {
		preferences: v2UserPreferences,
		setRightSidebarOpen,
		setRightSidebarTab,
		setRightSidebarWidth,
		setShowPresetsBar,
	} = useV2UserPreferences();
	const showPresetsBar = v2UserPreferences.showPresetsBar;
	const sidebarOpen = v2UserPreferences.rightSidebarOpen;
	const { store, isLayoutReady } = useV2WorkspacePaneLayout();
	useClearActivePaneAttention({ store });
	const launcher = useV2TerminalLauncher();
	const {
		matchedPresets,
		newTabPresets,
		executePreset,
		resolvePresetCommands,
	} = useV2PresetExecution({
		store,
		launcher,
	});
	const workspaceRun = useV2WorkspaceRun({
		store,
		launcher,
		matchedPresets,
		resolvePresetCommands,
	});
	useConsumeAutomationRunLink({
		store,
		workspaceId,
		terminalId,
		chatSessionId,
		focusRequestId,
	});
	useCreatePendingMigratedTerminals({ workspaceId, isLayoutReady });
	useAutoAdoptBackgroundSessions({ store, workspaceId, isLayoutReady });
	useConsumeOpenUrlRequest({
		store,
		url: openUrl,
		target: openUrlTarget,
		requestId: openUrlRequestId,
	});

	const {
		openFilePaneFromTreeClick,
		revealPath,
		selectedFilePath,
		pendingReveal,
		recentFiles,
		openFilePaths,
	} = useWorkspaceFileNavigation({
		store,
		setRightSidebarOpen,
		setRightSidebarTab,
	});

	const paneRegistry = usePaneRegistry({
		onOpenFile: openFilePaneFromTreeClick,
		onRevealPath: revealPath,
		launcher,
		store,
	});
	const defaultContextMenuActions = useDefaultContextMenuActions({
		paneRegistry,
		launcher,
	});
	const {
		openDiffPane,
		addTerminalTab,
		addChatTab,
		addBrowserTab,
		openCommentPane,
	} = useWorkspacePaneOpeners({
		store,
		launcher,
		newTabPresets,
		executePreset,
	});

	const quickOpenOpen = useQuickOpenStore(
		(s) => s.open && s.target?.workspaceId === workspaceId,
	);
	const closeQuickOpen = useQuickOpenStore((s) => s.close);
	const openQuickOpenFor = useQuickOpenStore((s) => s.openFor);
	const handleQuickOpen = useCallback(
		() => openQuickOpenFor({ workspaceId }),
		[openQuickOpenFor, workspaceId],
	);
	const handleQuickOpenChange = useCallback(
		(next: boolean) => {
			if (!next) closeQuickOpen();
		},
		[closeQuickOpen],
	);
	// Picking a file from Quick Open should surface the sidebar/Files tab so
	// the reveal (expand + highlight + scroll) is actually visible.
	const handleQuickOpenSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			setRightSidebarOpen(true);
			setRightSidebarTab("files");
			openFilePaneFromTreeClick(filePath, openInNewTab);
		},
		[openFilePaneFromTreeClick, setRightSidebarOpen, setRightSidebarTab],
	);
	const defaultPaneActions = useDefaultPaneActions({ launcher });
	const onBeforeCloseTab = useTabCloseGuard();

	// Fallback for rows persisted before the rightSidebarWidth field existed —
	// the live collection skips zod defaults, so an older row reads undefined
	// here and would render the ResizablePanel without a width (full-bleed).
	const sidebarWidth = v2UserPreferences.rightSidebarWidth ?? 340;
	const [isSidebarResizing, setIsSidebarResizing] = useState(false);
	const { onSidebarResizeDragging, onWorkspaceInteractionStateChange } =
		useBrowserShellInteractionPassthrough({ sidebarOpen });
	const handleSidebarResizingChange = useCallback(
		(resizing: boolean) => {
			setIsSidebarResizing(resizing);
			onSidebarResizeDragging(resizing);
		},
		[onSidebarResizeDragging],
	);

	// The sidebar slot lives at the dashboard layout level (next to TopBar) so
	// the sidebar runs full-height.
	const sidebarSlotEl = useSlotElement("workspace-right-sidebar-slot");
	// TopBar slot for the run button when the presets bar (its usual home) is
	// hidden. The button renders here via portal so it keeps this page's
	// context (pane store, workspace providers) while appearing in the TopBar.
	const runButtonSlotEl = useSlotElement("workspace-topbar-run-slot");

	useWorkspaceHotkeys({
		store,
		matchedPresets,
		executePreset,
		addTerminalTab,
		paneRegistry,
		launcher,
		onBeforeCloseTab,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);
	useHotkey("RUN_WORKSPACE_COMMAND", () => {
		void workspaceRun.toggleWorkspaceRun();
	});

	const workspaceRunButton = (
		<V2WorkspaceRunButton
			projectId={workspace.projectId}
			definition={workspaceRun.definition}
			isRunning={workspaceRun.isRunning}
			isPending={workspaceRun.isPending}
			canForceStop={workspaceRun.canForceStop}
			onToggle={workspaceRun.toggleWorkspaceRun}
			onForceStop={workspaceRun.forceStopWorkspaceRun}
		/>
	);

	return (
		<FileDocumentStoreProvider>
			<WorkspaceGitStatusProvider
				workspaceId={workspaceId}
				store={store}
				sidebarOpen={sidebarOpen}
			>
				<div className="flex min-h-0 min-w-0 flex-1">
					<div
						className="flex min-h-0 min-w-[320px] flex-1 flex-col overflow-hidden"
						data-workspace-id={workspaceId}
					>
						<Workspace<PaneViewerData>
							key={workspaceId}
							registry={paneRegistry}
							paneActions={defaultPaneActions}
							contextMenuActions={defaultContextMenuActions}
							renderTabIcon={renderBrowserTabIcon}
							renderTabAccessory={(tab) => (
								<V2NotificationStatusIndicator
									sources={getV2NotificationSourcesForTab(tab)}
								/>
							)}
							renderBelowTabBar={() =>
								showPresetsBar ? (
									<V2PresetsBar
										matchedPresets={matchedPresets}
										executePreset={executePreset}
										showPresetsBar={showPresetsBar}
										onToggleShowPresetsBar={setShowPresetsBar}
										trailing={workspaceRunButton}
									/>
								) : null
							}
							renderAddTabMenu={() => (
								<AddTabMenu
									onAddTerminal={addTerminalTab}
									onAddChat={addChatTab}
									onAddBrowser={addBrowserTab}
									showPresetsBar={showPresetsBar}
									onToggleShowPresetsBar={setShowPresetsBar}
								/>
							)}
							renderTabBarTrailing={() => (
								<BackgroundTerminalsButton
									workspaceId={workspaceId}
									store={store}
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
				</div>
				{!showPresetsBar &&
					runButtonSlotEl &&
					createPortal(workspaceRunButton, runButtonSlotEl)}
				{sidebarOpen &&
					sidebarSlotEl &&
					createPortal(
						<ResizablePanel
							width={sidebarWidth}
							onWidthChange={setRightSidebarWidth}
							isResizing={isSidebarResizing}
							onResizingChange={handleSidebarResizingChange}
							minWidth={240}
							maxWidth={640}
							handleSide="left"
							onDoubleClickHandle={() => setRightSidebarWidth(340)}
						>
							<WorkspaceSidebar
								workspaceId={workspaceId}
								onSelectFile={openFilePaneFromTreeClick}
								onSelectDiffFile={openDiffPane}
								onOpenComment={openCommentPane}
								onSearch={handleQuickOpen}
								selectedFilePath={selectedFilePath}
								pendingReveal={pendingReveal}
							/>
						</ResizablePanel>,
						sidebarSlotEl,
					)}
			</WorkspaceGitStatusProvider>
			<CommandPalette
				workspaceId={workspaceId}
				open={quickOpenOpen}
				onOpenChange={handleQuickOpenChange}
				onSelectFile={handleQuickOpenSelectFile}
				variant="v2"
				recentlyViewedFiles={recentFiles}
				openFilePaths={openFilePaths}
			/>
		</FileDocumentStoreProvider>
	);
}
