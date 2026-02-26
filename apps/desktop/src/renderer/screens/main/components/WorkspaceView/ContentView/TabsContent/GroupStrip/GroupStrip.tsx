import type { TerminalPreset } from "@superset/local-db";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePresets } from "renderer/react-query/presets";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	isLastPaneInTab,
	resolveActiveTabIdForWorkspace,
} from "renderer/stores/tabs/utils";
import {
	DEFAULT_SHOW_PRESETS_BAR,
	DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON,
} from "shared/constants";
import { type ActivePaneStatus, pickHigherStatus } from "shared/tabs-types";
import { AddTabButton } from "./components/AddTabButton";
import { GroupItem } from "./GroupItem";

const NO_WORKSPACE_MATCH = "__no_workspace__";

export function GroupStrip() {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });

	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);
	const { addTab, openPreset } = useTabsWithPresets();
	const addChatMastraTab = useTabsStore((s) => s.addChatMastraTab);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const renameTab = useTabsStore((s) => s.renameTab);
	const removeTab = useTabsStore((s) => s.removeTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const movePaneToTab = useTabsStore((s) => s.movePaneToTab);
	const movePaneToNewTab = useTabsStore((s) => s.movePaneToNewTab);
	const reorderTabs = useTabsStore((s) => s.reorderTabs);

	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const { presets } = usePresets();
	const navigate = useNavigate();

	const hasAiChat = useFeatureFlagEnabled(FEATURE_FLAGS.AI_CHAT);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const tabsTrackRef = useRef<HTMLDivElement>(null);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
	const utils = electronTrpc.useUtils();
	const { data: showPresetsBar } =
		electronTrpc.settings.getShowPresetsBar.useQuery();
	const { data: useCompactTerminalAddButton } =
		electronTrpc.settings.getUseCompactTerminalAddButton.useQuery();
	const setShowPresetsBar = electronTrpc.settings.setShowPresetsBar.useMutation(
		{
			onMutate: async ({ enabled }) => {
				await utils.settings.getShowPresetsBar.cancel();
				const previous = utils.settings.getShowPresetsBar.getData();
				utils.settings.getShowPresetsBar.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getShowPresetsBar.setData(undefined, context.previous);
				}
			},
			onSettled: () => {
				utils.settings.getShowPresetsBar.invalidate();
			},
		},
	);
	const setUseCompactTerminalAddButton =
		electronTrpc.settings.setUseCompactTerminalAddButton.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getUseCompactTerminalAddButton.cancel();
				const previous =
					utils.settings.getUseCompactTerminalAddButton.getData();
				utils.settings.getUseCompactTerminalAddButton.setData(
					undefined,
					enabled,
				);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getUseCompactTerminalAddButton.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getUseCompactTerminalAddButton.invalidate();
			},
		});

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const activeTabId = useMemo(() => {
		if (!activeWorkspaceId) return null;
		return resolveActiveTabIdForWorkspace({
			workspaceId: activeWorkspaceId,
			tabs: allTabs,
			activeTabIds,
			tabHistoryStacks,
		});
	}, [activeWorkspaceId, activeTabIds, allTabs, tabHistoryStacks]);

	// Compute aggregate status per tab using shared priority logic
	const tabStatusMap = useMemo(() => {
		const result = new Map<string, ActivePaneStatus>();
		for (const pane of Object.values(panes)) {
			if (!pane.status || pane.status === "idle") continue;
			const higher = pickHigherStatus(result.get(pane.tabId), pane.status);
			if (higher !== "idle") {
				result.set(pane.tabId, higher);
			}
		}
		return result;
	}, [panes]);

	// Sync Electric session titles → tab names for all Mastra chat tabs in this workspace
	const chatPaneSessionMap = useMemo(() => {
		const map = new Map<string, string>(); // sessionId → tabId
		for (const pane of Object.values(panes)) {
			if (pane.type === "chat-mastra" && pane.chatMastra?.sessionId) {
				const tab = tabs.find((t) => t.id === pane.tabId);
				if (tab) map.set(pane.chatMastra.sessionId, tab.id);
			}
		}
		return map;
	}, [panes, tabs]);
	const shouldSyncChatTitles =
		Boolean(activeWorkspaceId) && chatPaneSessionMap.size > 0;
	const workspaceIdForChatTitleSync = shouldSyncChatTitles
		? activeWorkspaceId
		: NO_WORKSPACE_MATCH;

	const collections = useCollections();
	const { data: chatSessions } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					eq(chatSessions.workspaceId, workspaceIdForChatTitleSync),
				)
				.select(({ chatSessions }) => ({
					id: chatSessions.id,
					title: chatSessions.title,
				})),
		[collections.chatSessions, workspaceIdForChatTitleSync],
	);

	useEffect(() => {
		if (!shouldSyncChatTitles) return;
		if (!chatSessions) return;
		for (const session of chatSessions) {
			const tabId = chatPaneSessionMap.get(session.id);
			if (tabId) {
				setTabAutoTitle(tabId, session.title || "New Chat");
			}
		}
	}, [chatSessions, chatPaneSessionMap, setTabAutoTitle, shouldSyncChatTitles]);

	const handleAddGroup = () => {
		if (!activeWorkspaceId) return;
		addTab(activeWorkspaceId);
	};

	const handleAddChat = () => {
		if (!activeWorkspaceId) return;
		addChatMastraTab(activeWorkspaceId);
	};

	const handleAddBrowser = () => {
		if (!activeWorkspaceId) return;
		addBrowserTab(activeWorkspaceId);
	};

	const handleOpenPreset = useCallback(
		(preset: TerminalPreset) => {
			if (!activeWorkspaceId) return;
			openPreset(activeWorkspaceId, preset, { target: "active-tab" });
		},
		[activeWorkspaceId, openPreset],
	);

	const handleOpenPresetsSettings = useCallback(() => {
		navigate({ to: "/settings/presets" });
	}, [navigate]);

	const handleSelectGroup = (tabId: string) => {
		if (activeWorkspaceId) {
			setActiveTab(activeWorkspaceId, tabId);
		}
	};

	const handleCloseGroup = (tabId: string) => {
		removeTab(tabId);
	};

	const handleRenameGroup = (tabId: string, newName: string) => {
		renameTab(tabId, newName);
	};

	const handleReorderTabs = useCallback(
		(fromIndex: number, toIndex: number) => {
			if (activeWorkspaceId) {
				reorderTabs(activeWorkspaceId, fromIndex, toIndex);
			}
		},
		[activeWorkspaceId, reorderTabs],
	);

	const checkIsLastPaneInTab = useCallback((paneId: string) => {
		// Get fresh panes from store to avoid stale closure issues during drag-drop
		const freshPanes = useTabsStore.getState().panes;
		const pane = freshPanes[paneId];
		if (!pane) return true;
		return isLastPaneInTab(freshPanes, pane.tabId);
	}, []);

	const updateOverflow = useCallback(() => {
		const container = scrollContainerRef.current;
		const track = tabsTrackRef.current;
		if (!container || !track) return;
		setHasHorizontalOverflow(track.scrollWidth > container.clientWidth + 1);
	}, []);

	useLayoutEffect(() => {
		const container = scrollContainerRef.current;
		const track = tabsTrackRef.current;
		if (!container || !track) return;

		updateOverflow();
		const resizeObserver = new ResizeObserver(updateOverflow);
		resizeObserver.observe(container);
		resizeObserver.observe(track);
		window.addEventListener("resize", updateOverflow);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", updateOverflow);
		};
	}, [updateOverflow]);

	useEffect(() => {
		requestAnimationFrame(updateOverflow);
	}, [updateOverflow]);

	const useCompactAddButton =
		useCompactTerminalAddButton ?? DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON;

	const plusControl = (
		<AddTabButton
			hasAiChat={hasAiChat === true}
			useCompactAddButton={useCompactAddButton}
			showPresetsBar={showPresetsBar ?? DEFAULT_SHOW_PRESETS_BAR}
			presets={presets}
			onDropToNewTab={movePaneToNewTab}
			isLastPaneInTab={checkIsLastPaneInTab}
			onAddTerminal={handleAddGroup}
			onAddChat={handleAddChat}
			onAddBrowser={handleAddBrowser}
			onOpenPreset={handleOpenPreset}
			onConfigurePresets={handleOpenPresetsSettings}
			onToggleShowPresetsBar={(enabled) =>
				setShowPresetsBar.mutate({ enabled })
			}
			onToggleCompactAddButton={(enabled) =>
				setUseCompactTerminalAddButton.mutate({ enabled })
			}
		/>
	);

	return (
		<div className="flex h-10 min-w-0 flex-1 items-stretch">
			<div
				ref={scrollContainerRef}
				className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
				style={{ scrollbarWidth: "none" }}
			>
				<div ref={tabsTrackRef} className="flex items-stretch">
					{tabs.length > 0 && (
						<div className="flex items-stretch h-full shrink-0">
							{tabs.map((tab, index) => {
								return (
									<div
										key={tab.id}
										className="h-full shrink-0"
										style={{ width: "160px" }}
									>
										<GroupItem
											tab={tab}
											index={index}
											isActive={tab.id === activeTabId}
											status={tabStatusMap.get(tab.id) ?? null}
											onSelect={() => handleSelectGroup(tab.id)}
											onClose={() => handleCloseGroup(tab.id)}
											onRename={(newName) => handleRenameGroup(tab.id, newName)}
											onPaneDrop={(paneId) => movePaneToTab(paneId, tab.id)}
											onReorder={handleReorderTabs}
										/>
									</div>
								);
							})}
						</div>
					)}
					{hasHorizontalOverflow ? (
						<div
							className={`h-full shrink-0 ${
								!useCompactAddButton
									? hasAiChat
										? "w-[220px]"
										: "w-[170px]"
									: "w-10"
							}`}
						/>
					) : (
						<div className="shrink-0">{plusControl}</div>
					)}
				</div>
			</div>
			{hasHorizontalOverflow && (
				<div className="shrink-0 bg-background/95 pr-1">{plusControl}</div>
			)}
		</div>
	);
}
