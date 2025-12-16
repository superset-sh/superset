import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LayoutGroup, motion } from "framer-motion";
import type { TerminalPreset } from "main/lib/db/schemas";
import { useMemo, useRef, useState } from "react";
import { useDrop } from "react-dnd";
import {
	HiMiniCommandLine,
	HiMiniEllipsisHorizontal,
	HiMiniPlus,
} from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { trpc } from "renderer/lib/trpc";
import { usePresets } from "renderer/react-query/presets";
import { useOpenSettings, useSidebarStore } from "renderer/stores";
import { useTabsStore } from "renderer/stores/tabs/store";
import { TabItem } from "./TabItem";
import { TabsCommandDialog } from "./TabsCommandDialog";

const DRAG_TYPE = "TAB";

interface DragItem {
	type: typeof DRAG_TYPE;
	tabId: string;
	index: number;
}

export function TabsView() {
	const isResizing = useSidebarStore((s) => s.isResizing);
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const addTab = useTabsStore((s) => s.addTab);
	const addPane = useTabsStore((s) => s.addPane);
	const renameTab = useTabsStore((s) => s.renameTab);
	const reorderTabById = useTabsStore((s) => s.reorderTabById);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const [commandOpen, setCommandOpen] = useState(false);
	const openSettings = useOpenSettings();
	const containerRef = useRef<HTMLElement>(null);

	const { presets } = usePresets();
	const isDark = useIsDarkTheme();

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

	const handleAddTab = () => {
		if (!activeWorkspaceId) return;

		// If there's an active tab, add a pane to it instead of creating a new tab
		if (activeTabId) {
			const paneId = addPane(activeTabId);
			// Fall back to creating a new tab if the active tab no longer exists
			if (!paneId) {
				addTab(activeWorkspaceId);
			}
		} else {
			addTab(activeWorkspaceId);
		}
		setCommandOpen(false);
	};

	const handleOpenPresetsSettings = () => {
		openSettings("presets");
		setCommandOpen(false);
	};

	const handleSelectPreset = (preset: TerminalPreset) => {
		if (!activeWorkspaceId) return;

		const presetOptions = {
			initialCommands: preset.commands,
			initialCwd: preset.cwd || undefined,
			name: preset.name || undefined,
		};

		// If there's an active tab, add a pane to it instead of creating a new tab
		if (activeTabId) {
			const paneId = addPane(activeTabId, presetOptions);
			// Fall back to creating a new tab if the active tab no longer exists
			if (!paneId) {
				const { tabId } = addTab(activeWorkspaceId, presetOptions);
				if (preset.name) {
					renameTab(tabId, preset.name);
				}
			}
		} else {
			const { tabId } = addTab(activeWorkspaceId, presetOptions);
			// Rename the tab to the preset name only when creating a new tab
			if (preset.name) {
				renameTab(tabId, preset.name);
			}
		}

		setCommandOpen(false);
	};

	const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
		accept: DRAG_TYPE,
		hover: (item, monitor) => {
			if (!containerRef.current) return;

			const clientOffset = monitor.getClientOffset();
			if (!clientOffset) return;

			const tabItems = containerRef.current.querySelectorAll("[data-tab-item]");
			let newDropIndex = tabs.length;

			tabItems.forEach((element, index) => {
				const rect = element.getBoundingClientRect();
				const midY = rect.top + rect.height / 2;

				if (clientOffset.y < midY && index < newDropIndex) {
					newDropIndex = index;
				}
			});

			if (newDropIndex === item.index || newDropIndex === item.index + 1) {
				setDropIndex(null);
			} else {
				setDropIndex(newDropIndex);
			}
		},
		drop: (item) => {
			if (dropIndex !== null && dropIndex !== item.index) {
				const targetIndex = dropIndex > item.index ? dropIndex - 1 : dropIndex;
				reorderTabById(item.tabId, targetIndex);
			}
			setDropIndex(null);
		},
		collect: (monitor) => ({
			isOver: monitor.isOver(),
		}),
	});

	if (!isOver && dropIndex !== null) {
		setDropIndex(null);
	}

	return (
		<nav
			ref={(node) => {
				drop(node);
				(containerRef as React.MutableRefObject<HTMLElement | null>).current =
					node;
			}}
			className="flex flex-col h-full p-2"
		>
			<LayoutGroup>
				<motion.div
					layout={!isResizing}
					transition={{ layout: { duration: 0.2, ease: "easeInOut" } }}
				>
					<ButtonGroup className="w-full mb-1">
						<Button
							variant="ghost"
							onClick={handleAddTab}
							className="flex-1 text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between"
							disabled={!activeWorkspaceId}
						>
							<HiMiniPlus className="size-4" />
							<span className="truncate flex-1">New Terminal</span>
						</Button>
						<Button
							variant="ghost"
							onClick={() => setCommandOpen(true)}
							className="px-3 py-2 rounded-md cursor-pointer"
							disabled={!activeWorkspaceId}
						>
							<HiMiniEllipsisHorizontal className="size-4" />
						</Button>
					</ButtonGroup>
					{presets.length > 0 && (
						<div className="ml-4 pl-1 space-y-0.5 mb-2 border-l-2">
							{presets.map((preset) => {
								const tooltipText = preset.description || preset.cwd;
								const presetIcon = getPresetIcon(preset.name, isDark);
								const button = (
									<Button
										variant="ghost"
										onClick={() => handleSelectPreset(preset)}
										disabled={!activeWorkspaceId}
										className="w-full justify-start px-3 py-1.5 h-auto text-sm"
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
									</Button>
								);

								if (tooltipText) {
									return (
										<Tooltip key={preset.id} delayDuration={300}>
											<TooltipTrigger asChild>{button}</TooltipTrigger>
											<TooltipContent side="right">
												{tooltipText}
											</TooltipContent>
										</Tooltip>
									);
								}

								return <div key={preset.id}>{button}</div>;
							})}
						</div>
					)}
					<TabsCommandDialog
						open={commandOpen}
						onOpenChange={setCommandOpen}
						onAddTab={handleAddTab}
						onOpenPresetsSettings={handleOpenPresetsSettings}
						presets={presets}
						onSelectPreset={handleSelectPreset}
					/>
				</motion.div>
				<div className="text-sm text-sidebar-foreground space-y-1 relative">
					{tabs.map((tab, index) => (
						<motion.div
							key={tab.id}
							layout={!isResizing}
							initial={false}
							transition={{
								layout: { duration: 0.2, ease: "easeInOut" },
							}}
							className="relative"
						>
							{isOver && dropIndex === index && (
								<div className="absolute -top-1 left-0 right-0 h-0.5 bg-primary rounded-full z-20 pointer-events-none" />
							)}
							<div data-tab-item>
								<TabItem
									tab={tab}
									index={index}
									isActive={activeTabIds[activeWorkspaceId || ""] === tab.id}
								/>
							</div>
						</motion.div>
					))}
					{isOver && dropIndex === tabs.length && (
						<div className="h-0.5 bg-primary rounded-full z-20 pointer-events-none mt-1" />
					)}
				</div>
			</LayoutGroup>
		</nav>
	);
}
