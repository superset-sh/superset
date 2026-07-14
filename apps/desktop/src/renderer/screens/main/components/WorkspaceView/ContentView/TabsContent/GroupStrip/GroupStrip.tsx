import type { TerminalPreset } from "@superset/local-db";
import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useDrop } from "react-dnd";
import { MosaicDragType } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePresets } from "renderer/react-query/presets";
import { requestTabClose } from "renderer/stores/editor-state/editorCoordinator";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import { isLastPaneInTab } from "renderer/stores/tabs/utils";
import {
	DEFAULT_SHOW_PRESETS_BAR,
	DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON,
} from "shared/constants";
import { type ActivePaneStatus, pickHigherStatus } from "shared/tabs-types";
import { useShowPresetsBar } from "../../hooks/useShowPresetsBar";
import { AddTabButton } from "./components/AddTabButton";
import { GroupItem, type TabDragItem } from "./GroupItem";

interface GroupStripProps {
	workspaceId: string;
	/** Panel (editor group) this strip belongs to */
	panelId: string;
	/** Ordered tabs of this panel */
	tabs: Tab[];
	/** The panel's visible tab */
	activeTabId: string | null;
}

export function GroupStrip({
	workspaceId,
	panelId,
	tabs,
	activeTabId,
}: GroupStripProps) {
	const panes = useTabsStore((s) => s.panes);
	const addChatTab = useTabsStore((s) => s.addChatTab);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const renameTab = useTabsStore((s) => s.renameTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const movePaneToTab = useTabsStore((s) => s.movePaneToTab);
	const movePaneToNewTab = useTabsStore((s) => s.movePaneToNewTab);
	const moveTabToPanel = useTabsStore((s) => s.moveTabToPanel);
	const setPaneStatus = useTabsStore((s) => s.setPaneStatus);

	const navigate = useNavigate();
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);
	const { addTab, openPreset } = useTabsWithPresets(workspace?.projectId);
	const { matchedPresets: presets } = usePresets(workspace?.projectId);

	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const tabsTrackRef = useRef<HTMLDivElement>(null);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
	const utils = electronTrpc.useUtils();
	const { showPresetsBar, setShowPresetsBar } = useShowPresetsBar();
	const { data: useCompactTerminalAddButton } =
		electronTrpc.settings.getUseCompactTerminalAddButton.useQuery();
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

	// Aggregate status per tab (scoped to this panel's tabs)
	const tabStatusMap = (() => {
		const tabIds = new Set(tabs.map((t) => t.id));
		const result = new Map<string, ActivePaneStatus>();
		for (const pane of Object.values(panes)) {
			if (!pane.status || pane.status === "idle") continue;
			if (!tabIds.has(pane.tabId)) continue;
			const higher = pickHigherStatus(result.get(pane.tabId), pane.status);
			if (higher !== "idle") {
				result.set(pane.tabId, higher);
			}
		}
		return result;
	})();

	/** New tabs land in the focused panel, so focus this panel first */
	const focusPanel = useCallback(() => {
		if (activeTabId) {
			setActiveTab(workspaceId, activeTabId);
		}
	}, [workspaceId, activeTabId, setActiveTab]);

	const handleAddGroup = () => {
		focusPanel();
		addTab(workspaceId);
	};

	const handleAddChat = () => {
		addChatTab(workspaceId, { panelId });
	};

	const handleAddBrowser = () => {
		addBrowserTab(workspaceId, undefined, { panelId });
	};

	const handleOpenPreset = useCallback(
		(preset: TerminalPreset) => {
			focusPanel();
			openPreset(workspaceId, preset, { target: "active-tab" });
		},
		[workspaceId, focusPanel, openPreset],
	);

	const handleOpenPresetsSettings = useCallback(() => {
		navigate({ to: "/settings/presets" });
	}, [navigate]);

	const handleSelectGroup = (tabId: string) => {
		setActiveTab(workspaceId, tabId);
	};

	const handleCloseGroup = (tabId: string) => {
		requestTabClose(tabId);
	};

	const handleRenameGroup = (tabId: string, newName: string) => {
		renameTab(tabId, newName);
	};

	const handleMarkTabAsUnread = (tabId: string) => {
		for (const pane of Object.values(panes)) {
			if (pane.tabId === tabId) {
				setPaneStatus(pane.id, "review");
			}
		}
	};

	const handleMoveTabHere = useCallback(
		(tabId: string, index?: number) => {
			moveTabToPanel(tabId, panelId, index);
		},
		[moveTabToPanel, panelId],
	);

	const checkIsLastPaneInTab = useCallback((paneId: string) => {
		// Get fresh panes from store to avoid stale closure issues during drag-drop
		const freshPanes = useTabsStore.getState().panes;
		const pane = freshPanes[paneId];
		if (!pane) return true;
		return isLastPaneInTab(freshPanes, pane.tabId);
	}, []);

	// Dropping a tab on the strip's empty space appends it to this panel
	const [{ isTabOverStrip }, stripDrop] = useDrop<
		TabDragItem,
		{ handled: true },
		{ isTabOverStrip: boolean }
	>(
		() => ({
			accept: MosaicDragType.WINDOW,
			canDrop: (item) => item.isTabDrag === true,
			drop: (item, monitor) => {
				// A GroupItem already handled this drop
				if (monitor.didDrop()) return { handled: true };
				if (item.isTabDrag) {
					handleMoveTabHere(item.tabId);
				}
				return { handled: true };
			},
			collect: (monitor) => ({
				isTabOverStrip: monitor.isOver({ shallow: true }) && monitor.canDrop(),
			}),
		}),
		[handleMoveTabHere],
	);

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
		<div
			ref={(node) => {
				stripDrop(node);
			}}
			className="flex h-10 min-w-0 flex-1 items-stretch"
		>
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
											panelId={panelId}
											isActive={tab.id === activeTabId}
											status={tabStatusMap.get(tab.id) ?? null}
											onSelect={() => handleSelectGroup(tab.id)}
											onClose={() => handleCloseGroup(tab.id)}
											onRename={(newName) => handleRenameGroup(tab.id, newName)}
											onMarkAsUnread={() => handleMarkTabAsUnread(tab.id)}
											onPaneDrop={(paneId) => movePaneToTab(paneId, tab.id)}
											onTabDrop={handleMoveTabHere}
										/>
									</div>
								);
							})}
						</div>
					)}
					{hasHorizontalOverflow ? (
						<div
							className={`h-full shrink-0 ${
								!useCompactAddButton ? "w-[220px]" : "w-10"
							}`}
						/>
					) : (
						<div className="shrink-0">{plusControl}</div>
					)}
				</div>
				{isTabOverStrip && (
					<div className="my-1.5 w-0.5 shrink-0 rounded bg-primary/60" />
				)}
			</div>
			{hasHorizontalOverflow && (
				<div className="shrink-0 bg-background/95 pr-1">{plusControl}</div>
			)}
		</div>
	);
}
