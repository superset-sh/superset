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
import { useCallback, useMemo, useRef, useState } from "react";
import {
	HiMiniChevronDown,
	HiMiniCog6Tooth,
	HiMiniCommandLine,
	HiMiniPlus,
} from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { trpc } from "renderer/lib/trpc";
import { usePresets } from "renderer/react-query/presets";
import { useOpenSettings } from "renderer/stores";
import { useTabsStore } from "renderer/stores/tabs/store";
import { type ActivePaneStatus, pickHigherStatus } from "shared/tabs-types";
import { GroupItem } from "./GroupItem";

export function GroupStrip() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;

	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const addTab = useTabsStore((s) => s.addTab);
	const renameTab = useTabsStore((s) => s.renameTab);
	const removeTab = useTabsStore((s) => s.removeTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);

	const { presets } = usePresets();
	const isDark = useIsDarkTheme();
	const openSettings = useOpenSettings();
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleDropdownMouseEnter = useCallback(() => {
		if (hoverTimeoutRef.current) {
			clearTimeout(hoverTimeoutRef.current);
		}
		hoverTimeoutRef.current = setTimeout(() => {
			setDropdownOpen(true);
		}, 150);
	}, []);

	const handleDropdownMouseLeave = useCallback(() => {
		if (hoverTimeoutRef.current) {
			clearTimeout(hoverTimeoutRef.current);
		}
		hoverTimeoutRef.current = setTimeout(() => {
			setDropdownOpen(false);
		}, 150);
	}, []);

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

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
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
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
		openSettings("presets");
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

	return (
		<div className="flex items-center h-10 flex-1 min-w-0">
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
						<TooltipContent side="bottom" sideOffset={4}>
							<HotkeyTooltipContent label="New Tab" hotkeyId="NEW_GROUP" />
						</TooltipContent>
					</Tooltip>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-7 rounded-l-none px-1"
							onMouseEnter={handleDropdownMouseEnter}
							onMouseLeave={handleDropdownMouseLeave}
						>
							<HiMiniChevronDown className="size-3" />
						</Button>
					</DropdownMenuTrigger>
				</div>
				<DropdownMenuContent
					align="end"
					className="w-56"
					onMouseEnter={handleDropdownMouseEnter}
					onMouseLeave={handleDropdownMouseLeave}
				>
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
