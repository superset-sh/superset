import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { useParams } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { BsTerminalPlus } from "react-icons/bs";
import { LuPlus } from "react-icons/lu";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	isLastPaneInTab,
	resolveActiveTabIdForWorkspace,
} from "renderer/stores/tabs/utils";
import { type ActivePaneStatus, pickHigherStatus } from "shared/tabs-types";
import { GroupItem } from "./GroupItem";
import { NewTabDropZone } from "./NewTabDropZone";

export function GroupStrip() {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });

	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);
	const { addTab } = useTabsWithPresets();
	const addChatMastraTab = useTabsStore((s) => s.addChatMastraTab);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const renameTab = useTabsStore((s) => s.renameTab);
	const removeTab = useTabsStore((s) => s.removeTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const movePaneToTab = useTabsStore((s) => s.movePaneToTab);
	const movePaneToNewTab = useTabsStore((s) => s.movePaneToNewTab);
	const reorderTabs = useTabsStore((s) => s.reorderTabs);

	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);

	const hasAiChat = useFeatureFlagEnabled(FEATURE_FLAGS.AI_CHAT);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const tabsTrackRef = useRef<HTMLDivElement>(null);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
	const utils = electronTrpc.useUtils();
	const { data: showPresetsBar } =
		electronTrpc.settings.getShowPresetsBar.useQuery();
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

	// Sync Electric session titles → tab names for all chat tabs in this workspace
	const chatPaneSessionMap = useMemo(() => {
		const map = new Map<string, string>(); // sessionId → tabId
		for (const pane of Object.values(panes)) {
			if (pane.type === "chat" && pane.chat?.sessionId) {
				const tab = tabs.find((t) => t.id === pane.tabId);
				if (tab) map.set(pane.chat.sessionId, tab.id);
			}
		}
		return map;
	}, [panes, tabs]);

	const collections = useCollections();
	const { data: chatSessions } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.select(({ chatSessions }) => ({
					id: chatSessions.id,
					title: chatSessions.title,
				})),
		[collections.chatSessions],
	);

	useEffect(() => {
		if (!chatSessions) return;
		for (const session of chatSessions) {
			const tabId = chatPaneSessionMap.get(session.id);
			if (tabId) {
				setTabAutoTitle(tabId, session.title || "New Chat");
			}
		}
	}, [chatSessions, chatPaneSessionMap, setTabAutoTitle]);

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

	const plusControl = (
		<NewTabDropZone
			onDrop={(paneId) => movePaneToNewTab(paneId)}
			isLastPaneInTab={checkIsLastPaneInTab}
		>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 px-1 shrink-0 rounded-md border border-border/60 bg-muted/30 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
					>
						<LuPlus className="size-3.5" strokeWidth={1.8} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuItem onClick={handleAddGroup} className="gap-2">
						<BsTerminalPlus className="size-4" />
						<span>Terminal</span>
						<HotkeyMenuShortcut hotkeyId="NEW_GROUP" />
					</DropdownMenuItem>
					{hasAiChat && (
						<DropdownMenuItem onClick={handleAddChat} className="gap-2">
							<TbMessageCirclePlus className="size-4" />
							<span>Chat</span>
							<HotkeyMenuShortcut hotkeyId="NEW_CHAT" />
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={handleAddBrowser} className="gap-2">
						<TbWorld className="size-4" />
						<span>Browser</span>
						<HotkeyMenuShortcut hotkeyId="NEW_BROWSER" />
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuCheckboxItem
						checked={showPresetsBar ?? false}
						onCheckedChange={(checked) =>
							setShowPresetsBar.mutate({ enabled: checked })
						}
						onSelect={(e) => e.preventDefault()}
					>
						Show Preset Bar
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</NewTabDropZone>
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
						<div className="h-full w-10 shrink-0" />
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
