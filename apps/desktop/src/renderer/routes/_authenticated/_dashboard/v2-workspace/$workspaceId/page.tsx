import { Workspace } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkey } from "renderer/hotkeys";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import { useWorkspaceCreatesStore } from "renderer/stores/workspace-creates";
import { WorkspaceCreateErrorState } from "../components/WorkspaceCreateErrorState";
import { WorkspaceCreatingState } from "../components/WorkspaceCreatingState";
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
	const inFlight = useWorkspaceCreatesStore((store) =>
		store.entries.find((entry) => entry.snapshot.id === workspaceId),
	);

	if (!workspaces) {
		return <div className="flex h-full w-full" />;
	}

	if (!workspace) {
		if (inFlight?.state === "creating") {
			return (
				<WorkspaceCreatingState
					name={inFlight.snapshot.name}
					branch={inFlight.snapshot.branch}
				/>
			);
		}
		if (inFlight?.state === "error") {
			return (
				<WorkspaceCreateErrorState
					workspaceId={workspaceId}
					name={inFlight.snapshot.name}
					error={inFlight.error ?? "Unknown error"}
				/>
			);
		}
		return <WorkspaceNotFoundState workspaceId={workspaceId} />;
	}

	return (
		// key={workspaceId} so each workspace gets its own pane store rather
		// than sharing one and replaceState-ing data across switches.
		<WorkspaceContent
			key={workspace.id}
			projectId={workspace.projectId}
			workspaceId={workspace.id}
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
	terminalId,
	chatSessionId,
	focusRequestId,
	openUrl,
	openUrlTarget,
	openUrlRequestId,
}: {
	projectId: string;
	workspaceId: string;
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
		setRightSidebarWidth,
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
	// the sidebar runs full-height. The slot is mounted by the parent layout
	// before this child renders, so look it up synchronously during state init —
	// otherwise users with rightSidebarOpen=true persisted see a 1-frame flash
	// while the post-mount effect fills the ref.
	const [sidebarSlotEl, setSidebarSlotEl] = useState<HTMLElement | null>(() =>
		typeof document !== "undefined"
			? document.getElementById("workspace-right-sidebar-slot")
			: null,
	);
	useEffect(() => {
		if (sidebarSlotEl) return;
		setSidebarSlotEl(document.getElementById("workspace-right-sidebar-slot"));
	}, [sidebarSlotEl]);

	useWorkspaceHotkeys({
		store,
		matchedPresets,
		executePreset,
		paneRegistry,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);

	return (
		<FileDocumentStoreProvider workspaceId={workspaceId}>
			<div className="flex min-h-0 min-w-0 flex-1">
				<div
					className="flex min-h-0 min-w-[320px] flex-1 flex-col overflow-hidden"
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
							onSelectFile={openFilePane}
							onSelectDiffFile={openDiffPane}
							onOpenComment={openCommentPane}
							onSearch={handleQuickOpen}
							selectedFilePath={selectedFilePath}
							pendingReveal={pendingReveal}
						/>
					</ResizablePanel>,
					sidebarSlotEl,
				)}
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
