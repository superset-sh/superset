import { createStream } from "@superset/ai-chat/stream";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate, useParams } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	HiMiniChevronDown,
	HiMiniCog6Tooth,
	HiMiniCommandLine,
	HiMiniPlus,
	HiStar,
} from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { env } from "renderer/env.renderer";
import { usePresets } from "renderer/react-query/presets";
import { useChatStore } from "renderer/routes/_authenticated/_dashboard/chats/stores/chatStore";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	isLastPaneInTab,
	resolveActiveTabIdForWorkspace,
} from "renderer/stores/tabs/utils";
import { type ActivePaneStatus, pickHigherStatus } from "shared/tabs-types";
import { PresetMenuItemShortcut } from "./components/PresetMenuItemShortcut";
import { GroupItem } from "./GroupItem";
import { NewTabDropZone } from "./NewTabDropZone";

const STREAM_SERVER_URL =
	env.NEXT_PUBLIC_STREAMS_URL || "http://localhost:8080";

export function GroupStrip() {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });

	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);
	const { addTab, openPreset } = useTabsWithPresets();
	const renameTab = useTabsStore((s) => s.renameTab);
	const removeTab = useTabsStore((s) => s.removeTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const movePaneToTab = useTabsStore((s) => s.movePaneToTab);
	const movePaneToNewTab = useTabsStore((s) => s.movePaneToNewTab);
	const reorderTabs = useTabsStore((s) => s.reorderTabs);
	const addChatPane = useTabsStore((s) => s.addChatPane);

	const { createSession } = useChatStore();
	const { presets } = usePresets();
	const isDark = useIsDarkTheme();
	const navigate = useNavigate();
	const [dropdownOpen, setDropdownOpen] = useState(false);

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

	const handleAddGroup = () => {
		if (!activeWorkspaceId) return;
		addTab(activeWorkspaceId);
	};

	const handleAddChat = useCallback(async () => {
		if (!activeWorkspaceId) return;
		const session = createSession();
		await createStream(STREAM_SERVER_URL, session.id);
		addChatPane(activeWorkspaceId, {
			sessionId: session.id,
			name: session.name,
		});
	}, [activeWorkspaceId, createSession, addChatPane]);

	const handleSelectPreset = (preset: Parameters<typeof openPreset>[1]) => {
		if (!activeWorkspaceId) return;
		openPreset(activeWorkspaceId, preset);
		setDropdownOpen(false);
	};

	const handleOpenPresetsSettings = () => {
		navigate({ to: "/settings/presets" });
		setDropdownOpen(false);
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

	// Tab navigation - find which tabs are adjacent to active
	const activeTabIndex = useMemo(() => {
		if (!activeTabId) return -1;
		return tabs.findIndex((t) => t.id === activeTabId);
	}, [tabs, activeTabId]);

	const checkIsLastPaneInTab = useCallback((paneId: string) => {
		// Get fresh panes from store to avoid stale closure issues during drag-drop
		const freshPanes = useTabsStore.getState().panes;
		const pane = freshPanes[paneId];
		if (!pane) return true;
		return isLastPaneInTab(freshPanes, pane.tabId);
	}, []);

	return (
		<div className="flex items-center h-10 flex-1 min-w-0">
			{tabs.length > 0 && (
				<div
					className="flex items-center h-full overflow-x-auto overflow-y-hidden border-l border-border"
					style={{ scrollbarWidth: "none" }}
				>
					{tabs.map((tab, index) => {
						const isPrevOfActive = index === activeTabIndex - 1;
						const isNextOfActive = index === activeTabIndex + 1;
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
									navHint={
										isPrevOfActive
											? "prev"
											: isNextOfActive
												? "next"
												: undefined
									}
								/>
							</div>
						);
					})}
				</div>
			)}
			<NewTabDropZone
				onDrop={(paneId) => movePaneToNewTab(paneId)}
				isLastPaneInTab={checkIsLastPaneInTab}
			>
				<div className="flex items-center shrink-0 gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-7"
								onClick={handleAddChat}
							>
								<MessageCircle className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={4}>
							New Chat
						</TooltipContent>
					</Tooltip>
					<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
						<div className="flex items-center shrink-0">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-7 rounded-r-none pl-2"
										onClick={handleAddGroup}
									>
										<HiMiniPlus className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" sideOffset={4}>
									<HotkeyTooltipContent label="New Tab" hotkeyId="NEW_GROUP" />
								</TooltipContent>
							</Tooltip>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7 rounded-l-none px-1"
								>
									<HiMiniChevronDown className="size-3" />
								</Button>
							</DropdownMenuTrigger>
						</div>
						<DropdownMenuContent align="end" className="w-56">
							{presets.length > 0 && (
								<>
									{presets.map((preset, index) => {
										const presetIcon = getPresetIcon(preset.name, isDark);
										return (
											<DropdownMenuItem
												key={preset.id}
												onClick={() => handleSelectPreset(preset)}
												className="gap-2"
											>
												{presetIcon ? (
													<img
														src={presetIcon}
														alt=""
														className="size-4 object-contain"
													/>
												) : (
													<HiMiniCommandLine className="size-4" />
												)}
												<span className="truncate">
													{preset.name || "default"}
												</span>
												{preset.isDefault && (
													<HiStar className="size-3 text-yellow-500 flex-shrink-0" />
												)}
												<PresetMenuItemShortcut index={index} />
											</DropdownMenuItem>
										);
									})}
									<DropdownMenuSeparator />
								</>
							)}
							<DropdownMenuItem
								onClick={handleOpenPresetsSettings}
								className="gap-2"
							>
								<HiMiniCog6Tooth className="size-4" />
								<span>Configure Presets</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</NewTabDropZone>
		</div>
	);
}
