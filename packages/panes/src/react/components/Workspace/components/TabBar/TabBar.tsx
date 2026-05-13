import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { PlusIcon } from "lucide-react";
import {
	type ReactNode,
	type UIEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDrop } from "react-dnd";
import type { Tab } from "../../../../../types";
import type { PaneRegistry } from "../../../../types";
import { PANE_DRAG_TYPE } from "../Tab/components/Pane/components/PaneHeader";
import { TAB_DRAG_TYPE, TabItem } from "./components/TabItem";
import { computeInsertIndex, getVisibleTabWindow, TAB_WIDTH } from "./utils";

interface TabBarProps<TData> {
	tabs: Tab<TData>[];
	registry: PaneRegistry<TData>;
	activeTabId: string | null;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onCloseOtherTabs: (tabId: string) => void;
	onCloseAllTabs: () => void;
	onRenameTab: (tabId: string, title: string | undefined) => void;
	onReorderTab: (tabId: string, toIndex: number) => void;
	onMovePaneToNewTab: (paneId: string, toIndex: number) => void;
	renderTabIcon?: (tab: Tab<TData>) => ReactNode;
	renderAddTabMenu?: () => ReactNode;
	renderTabBarTrailing?: () => ReactNode;
	renderTabAccessory?: (tab: Tab<TData>) => ReactNode;
}

type TabDragItem = { tabId: string };
type PaneDragItem = { paneId: string };

function AddTabButton<_TData>({
	renderAddTabMenu,
}: {
	renderAddTabMenu?: () => ReactNode;
}) {
	const button = (
		<Button
			className="size-7 rounded-md border border-border/60 bg-muted/30 px-1 text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground"
			size="icon"
			type="button"
			variant="ghost"
		>
			<PlusIcon className="size-3.5" />
		</Button>
	);

	if (renderAddTabMenu) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					{renderAddTabMenu()}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return button;
}

export function TabBar<TData>({
	tabs,
	registry,
	activeTabId,
	onSelectTab,
	onCloseTab,
	onCloseOtherTabs,
	onCloseAllTabs,
	onRenameTab,
	onReorderTab,
	onMovePaneToNewTab,
	renderTabIcon,
	renderAddTabMenu,
	renderTabBarTrailing,
	renderTabAccessory,
}: TabBarProps<TData>) {
	const tabsTrackRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const scrollMetricsFrameRef = useRef<number | null>(null);
	const [scrollMetrics, setScrollMetrics] = useState({
		clientWidth: 0,
		scrollLeft: 0,
	});

	const insertIndexRef = useRef<number | null>(null);
	const [insertIndex, setInsertIndex] = useState<number | null>(null);

	const [{ isOver }, connectDrop] = useDrop(
		() => ({
			accept: [TAB_DRAG_TYPE, PANE_DRAG_TYPE],
			hover: (_item: TabDragItem | PaneDragItem, monitor) => {
				const track = tabsTrackRef.current;
				const offset = monitor.getClientOffset();
				if (!track || !offset) return;

				const idx = computeInsertIndex(
					offset.x,
					track.getBoundingClientRect(),
					tabs.length,
				);
				if (idx !== insertIndexRef.current) {
					insertIndexRef.current = idx;
					setInsertIndex(idx);
				}
			},
			drop: (item: TabDragItem | PaneDragItem, monitor) => {
				const idx = insertIndexRef.current;
				if (idx === null) return;

				insertIndexRef.current = null;
				setInsertIndex(null);

				if (monitor.getItemType() === PANE_DRAG_TYPE && "paneId" in item) {
					onMovePaneToNewTab(item.paneId, idx);
					return;
				}

				if (monitor.getItemType() !== TAB_DRAG_TYPE || !("tabId" in item)) {
					return;
				}

				const dragIndex = tabs.findIndex((t) => t.id === item.tabId);
				if (dragIndex === -1) return;

				// Adjust for removal of dragged tab
				let toIndex = idx;
				if (dragIndex < toIndex) toIndex--;

				onReorderTab(item.tabId, toIndex);
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
			}),
		}),
		[tabs, onReorderTab, onMovePaneToNewTab],
	);

	const readScrollMetrics = useCallback(() => {
		const node = scrollContainerRef.current;
		if (!node) return;
		const nextMetrics = {
			clientWidth: node.clientWidth,
			scrollLeft: node.scrollLeft,
		};
		setScrollMetrics((currentMetrics) =>
			currentMetrics.clientWidth === nextMetrics.clientWidth &&
			currentMetrics.scrollLeft === nextMetrics.scrollLeft
				? currentMetrics
				: nextMetrics,
		);
	}, []);

	const scheduleScrollMetricsUpdate = useCallback(() => {
		if (scrollMetricsFrameRef.current !== null) return;
		if (typeof requestAnimationFrame !== "function") {
			readScrollMetrics();
			return;
		}
		scrollMetricsFrameRef.current = requestAnimationFrame(() => {
			scrollMetricsFrameRef.current = null;
			readScrollMetrics();
		});
	}, [readScrollMetrics]);

	const handleScroll = useCallback(
		(_event: UIEvent<HTMLDivElement>) => {
			scheduleScrollMetricsUpdate();
		},
		[scheduleScrollMetricsUpdate],
	);

	useEffect(
		() => () => {
			if (
				scrollMetricsFrameRef.current !== null &&
				typeof cancelAnimationFrame === "function"
			) {
				cancelAnimationFrame(scrollMetricsFrameRef.current);
				scrollMetricsFrameRef.current = null;
			}
		},
		[],
	);

	useLayoutEffect(() => {
		const node = scrollContainerRef.current;
		if (!node) return;

		readScrollMetrics();
		const resizeObserver = new ResizeObserver(scheduleScrollMetricsUpdate);
		resizeObserver.observe(node);

		return () => {
			resizeObserver.disconnect();
		};
	}, [readScrollMetrics, scheduleScrollMetricsUpdate]);

	useLayoutEffect(() => {
		readScrollMetrics();
	}, [readScrollMetrics]);

	const activeTabIndex = useMemo(
		() => tabs.findIndex((tab) => tab.id === activeTabId),
		[activeTabId, tabs],
	);
	const totalTabsWidth = tabs.length * TAB_WIDTH;
	const addTabButtonWidth = 40;
	const hasHorizontalOverflow =
		scrollMetrics.clientWidth > 0 &&
		totalTabsWidth + addTabButtonWidth > scrollMetrics.clientWidth + 1;
	const inlineAddTabWidth = hasHorizontalOverflow ? 0 : addTabButtonWidth;
	const tabsTrackWidth = totalTabsWidth + inlineAddTabWidth;

	useLayoutEffect(() => {
		const node = scrollContainerRef.current;
		const viewportWidth = scrollMetrics.clientWidth;
		if (!node || activeTabIndex < 0 || viewportWidth <= 0) return;

		const tabLeft = activeTabIndex * TAB_WIDTH;
		const tabRight = tabLeft + TAB_WIDTH;
		const viewportLeft = scrollMetrics.scrollLeft;
		const viewportRight = viewportLeft + viewportWidth;
		let nextScrollLeft = viewportLeft;

		if (tabLeft < viewportLeft) {
			nextScrollLeft = tabLeft;
		} else if (tabRight > viewportRight) {
			nextScrollLeft = tabRight - viewportWidth;
		}

		if (nextScrollLeft === viewportLeft) return;

		const boundedScrollLeft = Math.max(
			0,
			Math.min(nextScrollLeft, tabsTrackWidth - viewportWidth),
		);
		node.scrollLeft = boundedScrollLeft;
		setScrollMetrics((currentMetrics) =>
			currentMetrics.clientWidth === viewportWidth &&
			currentMetrics.scrollLeft === boundedScrollLeft
				? currentMetrics
				: { clientWidth: viewportWidth, scrollLeft: boundedScrollLeft },
		);
	}, [
		activeTabIndex,
		scrollMetrics.clientWidth,
		scrollMetrics.scrollLeft,
		tabsTrackWidth,
	]);

	// Clear indicator when cursor leaves the tab bar
	if (!isOver && insertIndexRef.current !== null) {
		insertIndexRef.current = null;
		if (insertIndex !== null) setInsertIndex(null);
	}

	const setRootRef = useCallback(
		(node: HTMLDivElement | null) => {
			connectDrop(node);
		},
		[connectDrop],
	);

	const setScrollContainerRef = useCallback((node: HTMLDivElement | null) => {
		scrollContainerRef.current = node;
	}, []);

	const insertLineLeft = insertIndex !== null ? insertIndex * TAB_WIDTH : null;
	const visibleTabWindow = useMemo(
		() =>
			getVisibleTabWindow({
				clientWidth: scrollMetrics.clientWidth,
				scrollLeft: scrollMetrics.scrollLeft,
				tabCount: tabs.length,
			}),
		[scrollMetrics.clientWidth, scrollMetrics.scrollLeft, tabs.length],
	);
	const visibleTabs = useMemo(
		() =>
			tabs
				.slice(visibleTabWindow.start, visibleTabWindow.end)
				.map((tab, offset) => ({
					index: visibleTabWindow.start + offset,
					tab,
				})),
		[tabs, visibleTabWindow],
	);

	if (tabs.length === 0) {
		return (
			<div
				ref={setRootRef}
				className="group/root-tabs flex h-10 min-w-0 shrink-0 items-stretch border-b border-border bg-background"
			>
				<div className="flex h-full w-10 shrink-0 items-center justify-center bg-background">
					<AddTabButton renderAddTabMenu={renderAddTabMenu} />
				</div>
				<div className="flex min-w-0 flex-1 items-stretch" />
				{renderTabBarTrailing && (
					<div className="flex h-full shrink-0 items-center px-1">
						{renderTabBarTrailing()}
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			ref={setRootRef}
			className="group/root-tabs flex h-10 min-w-0 shrink-0 items-stretch border-b border-border bg-background"
		>
			<div
				ref={setScrollContainerRef}
				onScroll={handleScroll}
				className="hide-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
			>
				<div
					ref={tabsTrackRef}
					className="relative h-full shrink-0"
					style={{ width: tabsTrackWidth }}
				>
					{visibleTabs.map(({ tab, index }) => (
						<div
							className="absolute top-0 h-full"
							key={tab.id}
							style={{ left: index * TAB_WIDTH, width: TAB_WIDTH }}
						>
							<TabItem
								tab={tab}
								tabs={tabs}
								registry={registry}
								index={index}
								isActive={tab.id === activeTabId}
								onSelect={() => onSelectTab(tab.id)}
								onClose={() => onCloseTab(tab.id)}
								onCloseOthers={() => onCloseOtherTabs(tab.id)}
								onCloseAll={onCloseAllTabs}
								onRename={(title) => onRenameTab(tab.id, title)}
								icon={renderTabIcon?.(tab)}
								accessory={renderTabAccessory?.(tab)}
							/>
						</div>
					))}
					{insertLineLeft !== null && (
						<div
							className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-primary opacity-85"
							style={{ left: insertLineLeft }}
						/>
					)}
					{!hasHorizontalOverflow && (
						<div
							className="absolute top-0 flex h-full w-10 items-center justify-center"
							style={{ left: totalTabsWidth }}
						>
							<AddTabButton renderAddTabMenu={renderAddTabMenu} />
						</div>
					)}
				</div>
			</div>
			{hasHorizontalOverflow && (
				<div className="flex h-full w-10 shrink-0 items-center justify-center bg-background">
					<AddTabButton renderAddTabMenu={renderAddTabMenu} />
				</div>
			)}
			{renderTabBarTrailing && (
				<div className="flex h-full shrink-0 items-center px-1">
					{renderTabBarTrailing()}
				</div>
			)}
		</div>
	);
}
