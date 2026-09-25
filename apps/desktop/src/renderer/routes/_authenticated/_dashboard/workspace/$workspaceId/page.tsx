import { Workspace } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { workspaceTrpc } from "@superset/workspace-client";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen/quickOpenStore";
import { ZoomStable } from "renderer/components/ZoomStable";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AppMenuButton } from "renderer/routes/_authenticated/_dashboard/components/AppMenuButton";
import { NavigationControls } from "renderer/routes/_authenticated/_dashboard/components/NavigationControls";
import { SidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/SidebarToggle";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/RightSidebarToggle";
import { TopBarPortsDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/TopBarPortsDropdown";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import {
	parseSubagentSearch,
	readSubagentSearch,
} from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { getNotificationSourcesForTab } from "renderer/stores/notifications";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { useStore } from "zustand";
import { StateScreenShell } from "../components/StateScreenShell";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { AddTabMenu } from "./components/AddTabMenu";
import { BackgroundTerminalsButton } from "./components/BackgroundTerminalsButton";
import { ChangesControl } from "./components/ChangesControl";
import { NotificationStatusIndicator } from "./components/NotificationStatusIndicator";
import { PresetsBar } from "./components/PresetsBar";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceMissingWorktreeState } from "./components/WorkspaceMissingWorktreeState";
import { WorkspaceOpenInButton } from "./components/WorkspaceOpenInButton";
import { WorkspacePagesMenu } from "./components/WorkspacePagesMenu";
import { WorkspaceRunButton } from "./components/WorkspaceRunButton";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useAgentSessionLauncher } from "./hooks/useAgentSessionLauncher";
import { useAutoAdoptBackgroundSessions } from "./hooks/useAutoAdoptBackgroundSessions";
import { useClearActivePaneAttention } from "./hooks/useClearActivePaneAttention";
import { useConsumeAutomationRunLink } from "./hooks/useConsumeAutomationRunLink";
import { useConsumeOpenUrlRequest } from "./hooks/useConsumeOpenUrlRequest";
import { useConsumeSubagentLink } from "./hooks/useConsumeSubagentLink";
import { useCreatePendingMigratedTerminals } from "./hooks/useCreatePendingMigratedTerminals";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { useDefaultPaneActions } from "./hooks/useDefaultPaneActions";
import { useDiffPaneTarget } from "./hooks/useDiffPaneTarget";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { renderBrowserTabIcon } from "./hooks/usePaneRegistry/components/BrowserPane";
import { usePresetExecution } from "./hooks/usePresetExecution";
import { usePullRequestPaneIntentOpener } from "./hooks/usePullRequestPaneIntentOpener";
import { useRunWorkspaceCreationPresets } from "./hooks/useRunWorkspaceCreationPresets";
import { useShellInteractionPassthrough } from "./hooks/useShellInteractionPassthrough";
import { useSlotElement } from "./hooks/useSlotElement";
import { useTabCloseGuard } from "./hooks/useTabCloseGuard";
import { useTerminalLauncher } from "./hooks/useTerminalLauncher";
import { useWorkspaceFileNavigation } from "./hooks/useWorkspaceFileNavigation";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import { useWorkspacePaneLayout } from "./hooks/useWorkspacePaneLayout";
import { useWorkspacePaneOpeners } from "./hooks/useWorkspacePaneOpeners";
import { useWorkspaceRun } from "./hooks/useWorkspaceRun";
import { WorkspaceGitStatusProvider } from "./providers/WorkspaceGitStatusProvider";
import { FileDocumentStoreProvider } from "./state/fileDocumentStore";
import type { ConsumeSearch, PaneViewerData } from "./types";
import { findVisibleChangesPane } from "./utils/openChangesPaneInStore";
import type { WorkspaceUrlOpenTarget } from "./utils/openUrlInWorkspace";

interface WorkspaceSearch {
	terminalId?: string;
	focusRequestId?: string;
	/** Deep link from the sidebar's agents chip into a subagent transcript. */
	subagentTerminalId?: string;
	subagentId?: string;
	subagentAgentId?: string;
	subagentType?: string;
	openUrl?: string;
	openUrlTarget?: WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}

function parseOpenUrlTarget(
	value: unknown,
): WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/workspace/$workspaceId/",
)({
	component: WorkspacePage,
	validateSearch: (raw: Record<string, unknown>): WorkspaceSearch => ({
		terminalId: parseNonEmptyString(raw.terminalId),
		focusRequestId: parseNonEmptyString(raw.focusRequestId),
		...readSubagentSearch(raw),
		openUrl: parseNonEmptyString(raw.openUrl),
		openUrlTarget: parseOpenUrlTarget(raw.openUrlTarget),
		openUrlRequestId: parseNonEmptyString(raw.openUrlRequestId),
	}),
});

function WorkspacePage() {
	const { workspace } = useWorkspace();
	const workspaceStatusQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspace.id },
		{
			refetchOnWindowFocus: true,
		},
	);

	if (workspaceStatusQuery.data?.worktreeExists === false) {
		return (
			<StateScreenShell>
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
			</StateScreenShell>
		);
	}

	return <WorkspaceContent />;
}

function WorkspaceContent() {
	const {
		terminalId,
		focusRequestId,
		subagentTerminalId,
		subagentId,
		subagentAgentId,
		subagentType,
		openUrl,
		openUrlTarget,
		openUrlRequestId,
	} = Route.useSearch();
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const navigate = Route.useNavigate();
	const consumeSearch = useCallback<ConsumeSearch>(
		(keys) => {
			void navigate({
				search: (prev) => ({
					...prev,
					...Object.fromEntries(keys.map((key) => [key, undefined])),
					focusRequestId: undefined,
				}),
				replace: true,
			});
		},
		[navigate],
	);

	const {
		preferences: userPreferences,
		setRightSidebarOpen,
		setRightSidebarWidth,
		setShowPresetsBar,
	} = useUserPreferences();
	const showPresetsBar = userPreferences.showPresetsBar;
	const sidebarOpen = userPreferences.rightSidebarOpen;
	const { store, isLayoutReady } = useWorkspacePaneLayout();
	useClearActivePaneAttention({ store });
	const launcher = useTerminalLauncher();
	const {
		matchedPresets,
		newTabPresets,
		executePreset,
		resolvePresetCommands,
	} = usePresetExecution({
		store,
		launcher,
	});
	const workspaceRun = useWorkspaceRun({
		store,
		launcher,
		matchedPresets,
		resolvePresetCommands,
	});
	useConsumeAutomationRunLink({
		store,
		workspaceId,
		terminalId,
		focusRequestId,
		consumeSearch,
	});
	const subagentLink = useMemo(
		() =>
			parseSubagentSearch({
				subagentTerminalId,
				subagentId,
				subagentAgentId,
				subagentType,
			}),
		[subagentTerminalId, subagentId, subagentAgentId, subagentType],
	);
	useConsumeSubagentLink({
		store,
		isLayoutReady,
		link: subagentLink,
		focusRequestId,
		consumeSearch,
	});
	useCreatePendingMigratedTerminals({ workspaceId, isLayoutReady });
	useRunWorkspaceCreationPresets({
		workspaceId,
		isLayoutReady,
		executePreset,
		resolvePresetCommands,
	});
	useAutoAdoptBackgroundSessions({ store, workspaceId, isLayoutReady });
	useConsumeOpenUrlRequest({
		store,
		url: openUrl,
		target: openUrlTarget,
		requestId: openUrlRequestId,
		consumeSearch,
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
	});

	const {
		openDiffPane,
		addTerminalTab,
		addChatV3Tab,
		addBrowserTab,
		openChangesPane,
		toggleChangesPane,
		openCommentPane,
		openPagePane,
		openPullRequestPane,
	} = useWorkspacePaneOpeners({
		store,
		launcher,
		newTabPresets,
		executePreset,
		setRightSidebarOpen,
		pageOpenAction: userPreferences.pageOpenAction,
	});
	const paneRegistry = usePaneRegistry({
		onOpenDiff: openDiffPane,
		onOpenComment: openCommentPane,
		onOpenFile: openFilePaneFromTreeClick,
		onRevealPath: revealPath,
		launcher,
		store,
	});
	const defaultContextMenuActions = useDefaultContextMenuActions({
		paneRegistry,
		launcher,
	});
	const diffPaneTarget = useDiffPaneTarget(store);
	const isChangesPaneOpen = useStore(
		store,
		(state) => findVisibleChangesPane(state) != null,
	);

	usePullRequestPaneIntentOpener({
		workspaceId,
		isLayoutReady,
		openPullRequestPane,
	});
	const hostTarget = useWorkspaceHostTarget(workspaceId);
	const isSandbox =
		hostTarget.status === "ready" && hostTarget.kind === "sandbox";
	const addDesktopTab = useCallback(() => {
		store.getState().addTab({
			panes: [{ kind: "desktop", data: { kind: "desktop" } }],
		});
	}, [store]);
	const isChatV3Enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHAT_V3) ?? false;
	const { createNewAgentSession, focusAgentTerminal } = useAgentSessionLauncher(
		{ workspaceId, store },
	);

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
			openFilePaneFromTreeClick(filePath, openInNewTab);
		},
		[openFilePaneFromTreeClick, setRightSidebarOpen],
	);
	const defaultPaneActions = useDefaultPaneActions({ launcher });
	const onBeforeCloseTab = useTabCloseGuard(store);

	// Fallback for rows persisted before the rightSidebarWidth field existed —
	// the live collection skips zod defaults, so an older row reads undefined
	// here and would render the ResizablePanel without a width (full-bleed).
	const sidebarWidth = userPreferences.rightSidebarWidth ?? 340;
	const [isSidebarResizing, setIsSidebarResizing] = useState(false);
	const { onSidebarResizeDragging, onWorkspaceInteractionStateChange } =
		useShellInteractionPassthrough({ sidebarOpen });
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

	useWorkspaceHotkeys({
		store,
		matchedPresets,
		executePreset,
		addTerminalTab,
		openChangesPane,
		paneRegistry,
		launcher,
		onBeforeCloseTab,
		isSandbox,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);
	useHotkey("RUN_WORKSPACE_COMMAND", () => {
		void workspaceRun.toggleWorkspaceRun();
	});

	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	// Default to Mac while loading so window controls don't flash in.
	const isMac = platform === undefined || platform === "darwin";
	const zoomFactor = useZoomFactor();
	const isSidebarPanelOpen = useWorkspaceSidebarStore((s) => s.isOpen);
	const isSidebarPanelCollapsed = useWorkspaceSidebarStore((s) =>
		s.isCollapsed(),
	);
	// With the sidebar collapsed the TopBar is hidden, so the tab bar hosts the
	// traffic-light overhang past the rail plus the sidebar/nav controls.
	const tabBarHostsChrome = isSidebarPanelOpen && isSidebarPanelCollapsed;

	const workspaceRunButton = (
		<WorkspaceRunButton
			projectId={workspace.projectId}
			definition={workspaceRun.definition}
			isRunning={workspaceRun.isRunning}
			isPending={workspaceRun.isPending}
			canForceStop={workspaceRun.canForceStop}
			onToggle={workspaceRun.toggleWorkspaceRun}
			onForceStop={workspaceRun.forceStopWorkspaceRun}
		/>
	);

	const pagesMenu = (
		<WorkspacePagesMenu
			workspaceId={workspaceId}
			onOpenPage={openPagePane}
			onCreateNewAgentSession={createNewAgentSession}
			onFocusAgentTerminal={focusAgentTerminal}
		/>
	);

	return (
		<FileDocumentStoreProvider>
			<WorkspaceGitStatusProvider workspaceId={workspaceId}>
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
								<NotificationStatusIndicator
									sources={getNotificationSourcesForTab(tab)}
								/>
							)}
							renderBelowTabBar={() =>
								showPresetsBar ? (
									<PresetsBar
										matchedPresets={matchedPresets}
										executePreset={executePreset}
										showPresetsBar={showPresetsBar}
										onToggleShowPresetsBar={setShowPresetsBar}
									/>
								) : null
							}
							renderAddTabMenu={() => (
								<AddTabMenu
									onAddTerminal={addTerminalTab}
									onAddChatV3={isChatV3Enabled ? addChatV3Tab : undefined}
									onAddBrowser={addBrowserTab}
									onAddChanges={openChangesPane}
									onAddDesktop={isSandbox ? addDesktopTab : undefined}
									showPresetsBar={showPresetsBar}
									onToggleShowPresetsBar={setShowPresetsBar}
								/>
							)}
							renderTabBarLeading={
								tabBarHostsChrome
									? () => (
											<div className="flex h-full items-center">
												{isMac && (
													<div
														className="drag h-full shrink-0"
														style={{
															width: `${Math.max(
																80 / zoomFactor -
																	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
																0,
															)}px`,
														}}
													/>
												)}
												<ZoomStable
													enabled={isMac}
													className="flex items-center gap-1.5 px-1"
												>
													{!isMac && <AppMenuButton />}
													<SidebarToggle />
													<NavigationControls />
												</ZoomStable>
											</div>
										)
									: undefined
							}
							renderTabBarTrailing={() => (
								<div className="flex items-center gap-1">
									{/* The expanded sidebar's header owns the ports pill; the
									    tab bar only hosts it for the collapsed rail, where
									    neither the header cluster nor the TopBar is visible. */}
									{tabBarHostsChrome && <TopBarPortsDropdown />}
									{/* Until the pane layout hydrates, tabs read as empty and
									    every running terminal miscounts as "background", so the
									    button would flash a bogus count on navigation. */}
									{isLayoutReady && (
										<BackgroundTerminalsButton
											workspaceId={workspaceId}
											store={store}
										/>
									)}
									{isLayoutReady && (
										<ChangesControl
											workspaceId={workspaceId}
											isChangesOpen={isChangesPaneOpen}
											onToggleChanges={toggleChangesPane}
											onOpenPullRequest={openPullRequestPane}
										/>
									)}
									{/* Open-in must not depend on the right sidebar being open,
									    so it lives here rather than in the sidebar's top strip
									    (#7167). Without an @container ancestor its branch label
									    stays hidden, which keeps it compact for the tab bar. */}
									<WorkspaceOpenInButton workspaceId={workspaceId} />
									<RightSidebarToggle />
									{!isMac && !sidebarOpen && <WindowControlsInset />}
								</div>
							)}
							renderEmptyState={() => (
								<WorkspaceEmptyState
									onOpenBrowser={addBrowserTab}
									onOpenChanges={openChangesPane}
									onOpenChatV3={isChatV3Enabled ? addChatV3Tab : undefined}
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
								runButton={workspaceRunButton}
								pagesMenu={pagesMenu}
								onSelectFile={openFilePaneFromTreeClick}
								onSelectDiffFile={openDiffPane}
								onOpenComment={openCommentPane}
								onOpenPullRequest={openPullRequestPane}
								onSearch={handleQuickOpen}
								selectedFilePath={selectedFilePath}
								selectedDiffTarget={diffPaneTarget}
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
				recentlyViewedFiles={recentFiles}
				openFilePaths={openFilePaths}
			/>
		</FileDocumentStoreProvider>
	);
}
