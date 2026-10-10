import { transferAllTabs, Workspace } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen/quickOpenStore";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { reportRendererError } from "renderer/lib/report-renderer-error";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { WindowChrome } from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import {
	parseSubagentSearch,
	readSubagentSearch,
} from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import { useStore } from "zustand";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { AddTabMenu } from "./components/AddTabMenu";
import { ChangesControl } from "./components/ChangesControl";
import { CloudWorkspaceTabBarControls } from "./components/CloudWorkspaceTabBarControls";
import { RightPaneArea, type RightPaneKind } from "./components/RightPaneArea";
import { V2NotificationStatusIndicator } from "./components/V2NotificationStatusIndicator";
import { V2PresetsBar } from "./components/V2PresetsBar";
import { V2WorkspaceOpenInButton } from "./components/V2WorkspaceOpenInButton";
import { V2WorkspaceRunButton } from "./components/V2WorkspaceRunButton";
import { WorkspaceActivityMenu } from "./components/WorkspaceActivityMenu";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceMissingWorktreeState } from "./components/WorkspaceMissingWorktreeState";
import { WorkspaceMoreMenu } from "./components/WorkspaceMoreMenu";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useAgentSessionLauncher } from "./hooks/useAgentSessionLauncher";
import { useAutoAdoptBackgroundSessions } from "./hooks/useAutoAdoptBackgroundSessions";
import { useAutoAdoptChatSessions } from "./hooks/useAutoAdoptChatSessions";
import { useClearActivePaneAttention } from "./hooks/useClearActivePaneAttention";
import { useConsumeAutomationRunLink } from "./hooks/useConsumeAutomationRunLink";
import { useConsumeOpenUrlRequest } from "./hooks/useConsumeOpenUrlRequest";
import { useConsumeSubagentLink } from "./hooks/useConsumeSubagentLink";
import { useCreatePendingMigratedTerminals } from "./hooks/useCreatePendingMigratedTerminals";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { useDefaultPaneActions } from "./hooks/useDefaultPaneActions";
import { useDiffPaneTarget } from "./hooks/useDiffPaneTarget";
import { usePaneAreaMoveActions } from "./hooks/usePaneAreaMoveActions";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { renderBrowserTabIcon } from "./hooks/usePaneRegistry/components/BrowserPane";
import { usePullRequestPaneIntentOpener } from "./hooks/usePullRequestPaneIntentOpener";
import { useRightPaneAreaExpansion } from "./hooks/useRightPaneAreaExpansion";
import { useRightPaneAreaLifecycle } from "./hooks/useRightPaneAreaLifecycle";
import { useRunPendingChatHandoff } from "./hooks/useRunPendingChatHandoff";
import { useRunWorkspaceCreationPresets } from "./hooks/useRunWorkspaceCreationPresets";
import { useShellInteractionPassthrough } from "./hooks/useShellInteractionPassthrough";
import { useSlotElement } from "./hooks/useSlotElement";
import { useTabCloseGuard } from "./hooks/useTabCloseGuard";
import { useV2PresetExecution } from "./hooks/useV2PresetExecution";
import { useV2TerminalLauncher } from "./hooks/useV2TerminalLauncher";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import { useV2WorkspaceRun } from "./hooks/useV2WorkspaceRun";
import { useWindowWidth } from "./hooks/useWindowWidth";
import { useWorkspaceFileNavigation } from "./hooks/useWorkspaceFileNavigation";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import { useWorkspacePaneOpeners } from "./hooks/useWorkspacePaneOpeners";
import { useWorkspaceRightSidebarOpen } from "./hooks/useWorkspaceRightSidebarOpen";
import { RightPaneLinkTargetProvider } from "./providers/RightPaneLinkTargetProvider";
import { WorkspaceGitStatusProvider } from "./providers/WorkspaceGitStatusProvider";
import { FileDocumentStoreProvider } from "./state/fileDocumentStore";
import type { ConsumeSearch, PaneViewerData } from "./types";
import {
	closeVisibleChangesPane,
	findVisibleChangesPane,
	openChangesPaneInStore,
} from "./utils/openChangesPaneInStore";
import type { V2WorkspaceUrlOpenTarget } from "./utils/openUrlInV2Workspace";

interface WorkspaceSearch {
	terminalId?: string;
	focusRequestId?: string;
	/** Deep link from the sidebar's agents chip into a subagent transcript. */
	subagentTerminalId?: string;
	subagentId?: string;
	subagentAgentId?: string;
	subagentType?: string;
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
		focusRequestId: parseNonEmptyString(raw.focusRequestId),
		...readSubagentSearch(raw),
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

	return <V2WorkspaceContent />;
}

function V2WorkspaceContent() {
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
		preferences: v2UserPreferences,
		setRightSidebarWidth,
		setRightPaneAreaWidth,
		setShowPresetsBar,
	} = useV2UserPreferences();
	const showPresetsBar = v2UserPreferences.showPresetsBar;
	const { isOpen: sidebarOpen, setOpen: setRightSidebarOpen } =
		useWorkspaceRightSidebarOpen(workspaceId);
	const toggleRightSidebar = useCallback(
		() => setRightSidebarOpen((prev) => !prev),
		[setRightSidebarOpen],
	);
	const { store, isLayoutReady, hasRow } = useV2WorkspacePaneLayout();
	useClearActivePaneAttention({ store });
	const rightPaneAreaFlag = useFeatureFlagEnabled(
		FEATURE_FLAGS.RIGHT_PANE_AREA,
	);
	const isRightPaneAreaEnabled = rightPaneAreaFlag === true;
	const { store: rightStore, isLayoutReady: isRightLayoutReady } =
		useV2WorkspacePaneLayout({ slot: "rightPaneLayout" });
	useClearActivePaneAttention({ store: rightStore });
	useRightPaneAreaLifecycle({
		workspaceId,
		flag: rightPaneAreaFlag,
		centerStore: store,
		rightStore,
		isReady: isLayoutReady && isRightLayoutReady,
		hasRow,
	});
	const linkedPaneStores = useMemo(() => [rightStore], [rightStore]);
	const fileDocumentStores = useMemo(
		() => [store, rightStore],
		[store, rightStore],
	);
	const launcher = useV2TerminalLauncher();
	const { createNewAgentSession, openAgentChat, focusAgentTerminal } =
		useAgentSessionLauncher({ workspaceId, store });
	const {
		matchedPresets,
		newTabPresets,
		executePreset,
		resolvePresetCommands,
	} = useV2PresetExecution({
		store,
		launcher,
		openAgentChat,
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
	useAutoAdoptBackgroundSessions({
		store,
		linkedStores: linkedPaneStores,
		workspaceId,
		isLayoutReady: isLayoutReady && isRightLayoutReady,
	});
	useAutoAdoptChatSessions({
		store,
		linkedStores: linkedPaneStores,
		workspaceId,
		isLayoutReady: isLayoutReady && isRightLayoutReady,
	});
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
			if (!isRightPaneAreaEnabled) setRightSidebarOpen(true);
			openFilePaneFromTreeClick(filePath, openInNewTab);
		},
		[openFilePaneFromTreeClick, setRightSidebarOpen, isRightPaneAreaEnabled],
	);
	const paneRegistry = usePaneRegistry({
		onOpenDiff: openDiffPane,
		onOpenComment: openCommentPane,
		onOpenFile: openFilePaneFromTreeClick,
		onRevealPath: revealPath,
		launcher,
		store,
		linkedStores: linkedPaneStores,
		onSearch: handleQuickOpen,
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
	const isRightChangesTabOpen = useStore(
		rightStore,
		(state) => findVisibleChangesPane(state) != null,
	);
	const openRightChangesTab = useCallback(() => {
		setRightSidebarOpen(true);
		openChangesPaneInStore(rightStore, "tab");
	}, [rightStore, setRightSidebarOpen]);
	const toggleRightChangesTab = useCallback(() => {
		if (sidebarOpen && closeVisibleChangesPane(rightStore)) return;
		openRightChangesTab();
	}, [rightStore, sidebarOpen, openRightChangesTab]);
	const openChanges = isRightPaneAreaEnabled
		? openRightChangesTab
		: openChangesPane;
	const toggleChanges = isRightPaneAreaEnabled
		? toggleRightChangesTab
		: toggleChangesPane;
	const isChangesOpen = isRightPaneAreaEnabled
		? sidebarOpen && isRightChangesTabOpen
		: isChangesPaneOpen;

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
	useRunPendingChatHandoff({
		workspaceId,
		isLayoutReady,
		createNewAgentSession,
	});

	const defaultPaneActions = useDefaultPaneActions({ launcher });
	const onBeforeCloseTab = useTabCloseGuard(store);
	const onBeforeCloseRightTab = useTabCloseGuard(rightStore);
	const lastActiveAreaRef = useRef<"center" | "right">("center");
	const activateCenterArea = useCallback(() => {
		lastActiveAreaRef.current = "center";
	}, []);
	const activateRightArea = useCallback(() => {
		lastActiveAreaRef.current = "right";
	}, []);
	useEffect(() => {
		const onWindowBlur = () => {
			const area = document.activeElement
				?.closest("[data-pane-area]")
				?.getAttribute("data-pane-area");
			if (area === "center" || area === "right")
				lastActiveAreaRef.current = area;
		};
		window.addEventListener("blur", onWindowBlur);
		return () => window.removeEventListener("blur", onWindowBlur);
	}, []);
	const getCloseTarget = useCallback(
		() =>
			isRightPaneAreaEnabled &&
			sidebarOpen &&
			lastActiveAreaRef.current === "right"
				? { store: rightStore, onBeforeCloseTab: onBeforeCloseRightTab }
				: { store, onBeforeCloseTab },
		[
			isRightPaneAreaEnabled,
			sidebarOpen,
			rightStore,
			onBeforeCloseRightTab,
			store,
			onBeforeCloseTab,
		],
	);
	const { openAgentChat: openRightAgentChat } = useAgentSessionLauncher({
		workspaceId,
		store: rightStore,
	});
	const { executePreset: executeRightPreset } = useV2PresetExecution({
		store: rightStore,
		launcher,
		openAgentChat: openRightAgentChat,
	});
	const rightOpeners = useWorkspacePaneOpeners({
		store: rightStore,
		launcher,
		newTabPresets,
		executePreset: executeRightPreset,
		setRightSidebarOpen,
	});
	const addRightPane = useCallback(
		(kind: RightPaneKind) => {
			switch (kind) {
				case "files":
				case "changes-list":
				case "review":
				case "pages-list":
					rightStore.getState().addTab({ panes: [{ kind, data: { kind } }] });
					return;
				case "diff":
					openChangesPaneInStore(rightStore, "tab");
					return;
				case "browser":
					rightOpeners.addBrowserTab();
					return;
				case "terminal":
					void rightOpeners.addTerminalTab();
					return;
			}
		},
		[rightStore, rightOpeners],
	);
	const openRightSidebar = useCallback(
		() => setRightSidebarOpen(true),
		[setRightSidebarOpen],
	);
	const rightPaneLinkTarget = useMemo(
		() =>
			isRightPaneAreaEnabled
				? { store: rightStore, reveal: openRightSidebar }
				: null,
		[isRightPaneAreaEnabled, rightStore, openRightSidebar],
	);
	const {
		isExpanded: isRightPaneAreaExpanded,
		toggleExpanded: toggleRightPaneAreaExpanded,
		discardSnapshot: discardRightPaneAreaExpansion,
	} = useRightPaneAreaExpansion({
		workspaceId,
		centerStore: store,
		rightStore,
		isOpen: sidebarOpen,
		isReady: isLayoutReady && isRightLayoutReady,
	});
	const centerContextMenuActions = usePaneAreaMoveActions({
		defaults: defaultContextMenuActions,
		enabled: isRightPaneAreaEnabled,
		source: store,
		target: rightStore,
		direction: "right",
		onMoved: openRightSidebar,
	});
	const rightContextMenuActions = usePaneAreaMoveActions({
		defaults: defaultContextMenuActions,
		enabled: isRightPaneAreaEnabled && !isRightPaneAreaExpanded,
		source: rightStore,
		target: store,
		direction: "center",
	});
	const mergeRightPaneAreaIntoCenter = useCallback(() => {
		discardRightPaneAreaExpansion();
		transferAllTabs({ source: rightStore, target: store });
		setRightSidebarOpen(false);
	}, [rightStore, store, setRightSidebarOpen, discardRightPaneAreaExpansion]);
	const showExpandedRightPaneArea =
		isRightPaneAreaEnabled && sidebarOpen && isRightPaneAreaExpanded;

	const windowWidth = useWindowWidth();
	const defaultRightPaneAreaWidth = Math.round(windowWidth * 0.4);
	const maxRightPaneAreaWidth = Math.round(windowWidth * 0.75);
	// Fallback for rows persisted before the rightSidebarWidth field existed —
	// the live collection skips zod defaults, so an older row reads undefined
	// here and would render the ResizablePanel without a width (full-bleed).
	const sidebarWidth = isRightPaneAreaEnabled
		? Math.max(
				240,
				Math.min(
					v2UserPreferences.rightPaneAreaWidth ?? defaultRightPaneAreaWidth,
					maxRightPaneAreaWidth,
				),
			)
		: (v2UserPreferences.rightSidebarWidth ?? 340);
	const setSidebarWidth = isRightPaneAreaEnabled
		? setRightPaneAreaWidth
		: setRightSidebarWidth;
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
		openChangesPane: openChanges,
		paneRegistry,
		launcher,
		getCloseTarget,
		isSandbox,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);
	useHotkey("RUN_WORKSPACE_COMMAND", () => {
		void workspaceRun.toggleWorkspaceRun();
	});

	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	// Default to Mac while loading so window controls don't flash in.
	const isMac = platform === undefined || platform === "darwin";

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

	const changesControl = isLayoutReady && (
		<ChangesControl
			workspaceId={workspaceId}
			isChangesOpen={isChangesOpen}
			onToggleChanges={toggleChanges}
			onOpenPullRequest={openPullRequestPane}
			paneAreaStyle={isRightPaneAreaEnabled}
		/>
	);

	const workspaceControls = (
		<>
			{changesControl}
			<WorkspaceMoreMenu
				workspaceId={workspaceId}
				projectId={workspace.projectId}
				runDefinition={workspaceRun.definition}
				isRunning={workspaceRun.isRunning}
				isRunPending={workspaceRun.isPending}
				canForceStop={workspaceRun.canForceStop}
				onToggleRun={workspaceRun.toggleWorkspaceRun}
				onForceStopRun={workspaceRun.forceStopWorkspaceRun}
			/>
		</>
	);

	const activityMenu = (
		<WorkspaceActivityMenu
			workspaceId={workspaceId}
			store={store}
			linkedStores={linkedPaneStores}
			isLayoutReady={isLayoutReady && isRightLayoutReady}
			onOpenPage={openPagePane}
			onCreateNewAgentSession={createNewAgentSession}
			onFocusAgentTerminal={focusAgentTerminal}
			changes={
				isRightPaneAreaEnabled
					? { isOpen: isChangesOpen, onToggle: toggleChanges }
					: undefined
			}
		/>
	);

	const rightPaneArea = (
		<RightPaneArea
			key={workspaceId}
			store={rightStore}
			registry={paneRegistry}
			paneActions={defaultPaneActions}
			contextMenuActions={rightContextMenuActions}
			onBeforeCloseTab={onBeforeCloseRightTab}
			onInteractionStateChange={onWorkspaceInteractionStateChange}
			workspaceControls={workspaceControls}
			isExpanded={isRightPaneAreaExpanded}
			onToggleExpanded={toggleRightPaneAreaExpanded}
			onToggleSidebar={toggleRightSidebar}
			onActivate={activateRightArea}
			onMergeIntoCenter={mergeRightPaneAreaIntoCenter}
			onAdd={addRightPane}
			showWindowControls={!isMac}
		/>
	);

	return (
		<FileDocumentStoreProvider stores={fileDocumentStores}>
			<RightPaneLinkTargetProvider value={rightPaneLinkTarget}>
				<WorkspaceGitStatusProvider workspaceId={workspaceId}>
					<div className="flex min-h-0 min-w-0 flex-1">
						<div
							className="flex min-h-0 min-w-[320px] flex-1 flex-col overflow-hidden"
							data-workspace-id={workspaceId}
							data-pane-area="center"
							onPointerDownCapture={activateCenterArea}
							onFocusCapture={activateCenterArea}
						>
							{showExpandedRightPaneArea ? (
								rightPaneArea
							) : (
								<Workspace<PaneViewerData>
									key={workspaceId}
									registry={paneRegistry}
									paneActions={defaultPaneActions}
									contextMenuActions={centerContextMenuActions}
									onPaneError={reportRendererError}
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
											/>
										) : null
									}
									renderAddTabMenu={() => (
										<AddTabMenu
											onAddTerminal={addTerminalTab}
											onAddBrowser={addBrowserTab}
											onAddChanges={openChanges}
											onAddDesktop={isSandbox ? addDesktopTab : undefined}
											showPresetsBar={showPresetsBar}
											onToggleShowPresetsBar={setShowPresetsBar}
										/>
									)}
									renderTabBarLeading={() => <WindowChrome />}
									renderTabBarTrailing={() => (
										<div
											className={cn(
												"flex items-center gap-1",
												isRightPaneAreaEnabled && "pr-1",
											)}
										>
											<CloudWorkspaceTabBarControls workspaceId={workspaceId} />
											{activityMenu}
											{isRightPaneAreaEnabled ? (
												!sidebarOpen && (
													<>
														{workspaceControls}
														<RightSidebarToggle
															compact
															isOpen={sidebarOpen}
															onToggle={toggleRightSidebar}
														/>
													</>
												)
											) : (
												<>
													{changesControl}
													{/* Open-in must not depend on the right sidebar being open,
											    so it lives here rather than in the sidebar's top strip
											    (#7167). Without an @container ancestor its branch label
											    stays hidden, which keeps it compact for the tab bar. */}
													<V2WorkspaceOpenInButton workspaceId={workspaceId} />
													<RightSidebarToggle
														isOpen={sidebarOpen}
														onToggle={toggleRightSidebar}
													/>
												</>
											)}
											{!isMac && !sidebarOpen && <WindowControlsInset />}
										</div>
									)}
									renderEmptyState={() => (
										<WorkspaceEmptyState
											onOpenBrowser={addBrowserTab}
											onOpenChanges={openChanges}
											onOpenQuickOpen={handleQuickOpen}
											onOpenTerminal={addTerminalTab}
										/>
									)}
									onBeforeCloseTab={onBeforeCloseTab}
									onInteractionStateChange={onWorkspaceInteractionStateChange}
									store={store}
								/>
							)}
						</div>
					</div>
					{sidebarOpen &&
						!showExpandedRightPaneArea &&
						sidebarSlotEl &&
						createPortal(
							<ResizablePanel
								width={sidebarWidth}
								onWidthChange={setSidebarWidth}
								isResizing={isSidebarResizing}
								onResizingChange={handleSidebarResizingChange}
								minWidth={240}
								maxWidth={isRightPaneAreaEnabled ? maxRightPaneAreaWidth : 640}
								handleSide="left"
								onDoubleClickHandle={() =>
									setSidebarWidth(
										isRightPaneAreaEnabled ? defaultRightPaneAreaWidth : 340,
									)
								}
							>
								{isRightPaneAreaEnabled ? (
									rightPaneArea
								) : (
									<WorkspaceSidebar
										workspaceId={workspaceId}
										runButton={workspaceRunButton}
										onSelectFile={openFilePaneFromTreeClick}
										onSelectDiffFile={openDiffPane}
										onOpenComment={openCommentPane}
										onOpenPullRequest={openPullRequestPane}
										onSearch={handleQuickOpen}
										selectedFilePath={selectedFilePath}
										selectedDiffTarget={diffPaneTarget}
										pendingReveal={pendingReveal}
									/>
								)}
							</ResizablePanel>,
							sidebarSlotEl,
						)}
				</WorkspaceGitStatusProvider>
			</RightPaneLinkTargetProvider>
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
