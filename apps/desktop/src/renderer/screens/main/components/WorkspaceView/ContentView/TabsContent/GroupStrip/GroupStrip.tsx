import type { TerminalPreset } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useDragLayer, useDrop } from "react-dnd";
import {
	HiMiniChevronDown,
	HiMiniCog6Tooth,
	HiMiniCommandLine,
	HiMiniPlus,
	HiStar,
} from "react-icons/hi2";
import { MosaicDragType } from "react-mosaic-component";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { usePresets } from "renderer/react-query/presets";
import { useDraggingPaneStore } from "renderer/stores/tabs/dragging-pane";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";
import { type ActivePaneStatus, pickHigherStatus } from "shared/tabs-types";
import { GroupItem } from "./GroupItem";

export function GroupStrip() {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });

	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);
	const { addTab } = useTabsWithPresets();
	const renameTab = useTabsStore((s) => s.renameTab);
	const removeTab = useTabsStore((s) => s.removeTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);

	const { presets } = usePresets();
	const isDark = useIsDarkTheme();
	const navigate = useNavigate();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	// Monitor global drag state to clear stale drag pane state
	// This handles edge cases where onDragEnd doesn't fire (e.g., source unmounts)
	const { isDragging } = useDragLayer((monitor) => ({
		isDragging: monitor.isDragging(),
	}));

	useEffect(() => {
		if (!isDragging) {
			const { draggingPaneId, setDraggingPane } =
				useDraggingPaneStore.getState();
			if (draggingPaneId) {
				setDraggingPane(null, null);
			}
		}
	}, [isDragging]);

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

	const handleSelectPreset = (preset: TerminalPreset) => {
		if (!activeWorkspaceId) return;

		const { tabId } = addTab(activeWorkspaceId, {
			initialCommands: preset.commands,
			initialCwd: preset.cwd || undefined,
		});

		if (preset.name) {
			renameTab(tabId, preset.name);
		}

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

	const resolveDropPaneId = () => {
		const { draggingPaneId, draggingTabId } = useDraggingPaneStore.getState();
		const {
			activeTabIds: currentActiveTabIds,
			tabHistoryStacks: currentTabHistoryStacks,
			tabs: currentTabs,
			panes: currentPanes,
			focusedPaneIds: currentFocusedPaneIds,
		} = useTabsStore.getState();

		if (draggingPaneId) {
			const pane = currentPanes[draggingPaneId];
			if (!draggingTabId || pane?.tabId === draggingTabId) {
				return draggingPaneId;
			}
		}

		if (!activeWorkspaceId) return null;
		const activeTabIdForWorkspace = resolveActiveTabIdForWorkspace({
			workspaceId: activeWorkspaceId,
			tabs: currentTabs,
			activeTabIds: currentActiveTabIds,
			tabHistoryStacks: currentTabHistoryStacks,
		});
		if (!activeTabIdForWorkspace) return null;
		return currentFocusedPaneIds[activeTabIdForWorkspace] ?? null;
	};

	// Get fresh state at call time to avoid stale closures
	const handlePaneDropToTab = (paneId: string, targetTabId: string) => {
		const { panes, tabs, movePaneToTab } = useTabsStore.getState();
		const pane = panes[paneId];
		if (!pane || pane.tabId === targetTabId) return;

		const targetTab = tabs.find((t) => t.id === targetTabId);
		const sourceTab = tabs.find((t) => t.id === pane.tabId);
		if (!targetTab || !sourceTab) return;
		if (targetTab.workspaceId !== sourceTab.workspaceId) return;

		movePaneToTab(paneId, targetTabId);
	};

	const [{ isOver: isOverStrip, canDrop: canDropStrip }, stripDropRef] =
		useDrop<unknown, void, { isOver: boolean; canDrop: boolean }>(
			() => ({
				accept: MosaicDragType.WINDOW,
				drop: (_item, monitor) => {
					// Skip if a nested drop target (GroupItem) already handled it
					if (monitor.didDrop()) return;
					if (!monitor.isOver({ shallow: true })) return;

					// Get fresh state at drop time to avoid stale closures
					const { setDraggingPane } = useDraggingPaneStore.getState();
					const paneId = resolveDropPaneId();
					if (!paneId) return;

					const { panes, tabs, movePaneToNewTab } = useTabsStore.getState();
					const pane = panes[paneId];
					if (!pane) return;

					const sourceTab = tabs.find((t) => t.id === pane.tabId);
					if (sourceTab?.workspaceId !== activeWorkspaceId) return;

					movePaneToNewTab(paneId);
					setDraggingPane(null, null);
				},
				canDrop: () => {
					const paneId = resolveDropPaneId();
					if (!paneId) return false;

					const { panes, tabs } = useTabsStore.getState();
					const pane = panes[paneId];
					if (!pane) return false;

					const sourceTab = tabs.find((t) => t.id === pane.tabId);
					return sourceTab?.workspaceId === activeWorkspaceId;
				},
				collect: (monitor) => ({
					isOver: monitor.isOver({ shallow: true }),
					canDrop: monitor.canDrop(),
				}),
			}),
			[activeWorkspaceId], // Only stable values in deps
		);

	const isStripDropActive = isOverStrip && canDropStrip;

	return (
		<div
			ref={(node) => {
				stripDropRef(node);
			}}
			className={cn(
				"flex items-center h-10 flex-1 min-w-0 transition-colors",
				isStripDropActive && "bg-accent/30",
			)}
		>
			{tabs.length > 0 && (
				<div
					className="flex items-center h-full overflow-x-auto overflow-y-hidden border-l border-border pr-2"
					style={{ scrollbarWidth: "none" }}
				>
					{tabs.map((tab) => (
						<div
							key={tab.id}
							className="h-full shrink-0"
							style={{ width: "160px" }}
						>
							<GroupItem
								tab={tab}
								isActive={tab.id === activeTabId}
								status={tabStatusMap.get(tab.id) ?? null}
								onSelect={() => handleSelectGroup(tab.id)}
								onClose={() => handleCloseGroup(tab.id)}
								onRename={(newName) => handleRenameGroup(tab.id, newName)}
								onPaneDrop={(paneId) => handlePaneDropToTab(paneId, tab.id)}
							/>
						</div>
					))}
				</div>
			)}
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<div className="flex items-center shrink-0">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-7 rounded-r-none"
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
							{presets.map((preset) => {
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
										<span className="truncate">{preset.name || "default"}</span>
										{preset.isDefault && (
											<HiStar className="size-3 text-yellow-500 ml-auto flex-shrink-0" />
										)}
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
	);
}
