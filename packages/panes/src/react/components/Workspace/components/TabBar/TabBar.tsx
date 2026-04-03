import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { PlusIcon } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useDrop } from "react-dnd";
import type { Tab } from "../../../../../types";
import { TAB_DRAG_TYPE, TabItem } from "./components/TabItem";
import { computeInsertIndex, TAB_WIDTH } from "./utils";

interface TabBarProps<TData> {
	tabs: Tab<TData>[];
	activeTabId: string | null;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onCloseOtherTabs: (tabId: string) => void;
	onCloseAllTabs: () => void;
	onRenameTab: (tabId: string, title: string) => void;
	onReorderTab: (tabId: string, toIndex: number) => void;
	getTabTitle: (tab: Tab<TData>) => string;
	renderAddTabMenu?: () => ReactNode;
	renderTabAccessory?: (tab: Tab<TData>) => ReactNode;
}

function AddTabButton<_TData>({
	renderAddTabMenu,
}: {
	renderAddTabMenu?: () => ReactNode;
}) {
	const button = (
		<Button
			className="h-full w-full rounded-none border-0 bg-transparent px-0 text-muted-foreground shadow-none hover:bg-tertiary/20 hover:text-foreground"
			size="sm"
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
	activeTabId,
	onSelectTab,
	onCloseTab,
	onCloseOtherTabs,
	onCloseAllTabs,
	onRenameTab,
	onReorderTab,
	getTabTitle,
	renderAddTabMenu,
	renderTabAccessory,
}: TabBarProps<TData>) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const tabsTrackRef = useRef<HTMLDivElement>(null);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

	const insertIndexRef = useRef<number | null>(null);
	const [insertIndex, setInsertIndex] = useState<number | null>(null);

	const [{ isOver }, connectDrop] = useDrop(
		() => ({
			accept: TAB_DRAG_TYPE,
			hover: (_item, monitor) => {
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
			drop: (item: { tabId: string }) => {
				const idx = insertIndexRef.current;
				if (idx === null) return;

				const dragIndex = tabs.findIndex((t) => t.id === item.tabId);
				if (dragIndex === -1) return;

				// Adjust for removal of dragged tab
				let toIndex = idx;
				if (dragIndex < toIndex) toIndex--;

				insertIndexRef.current = null;
				setInsertIndex(null);
				onReorderTab(item.tabId, toIndex);
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
			}),
		}),
		[tabs, onReorderTab],
	);

	// Clear indicator when cursor leaves the tab bar
	if (!isOver && insertIndexRef.current !== null) {
		insertIndexRef.current = null;
		if (insertIndex !== null) setInsertIndex(null);
	}

	const setScrollContainerRef = useCallback(
		(node: HTMLDivElement | null) => {
			(
				scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>
			).current = node;
			connectDrop(node);
		},
		[connectDrop],
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

	const insertLineLeft = insertIndex !== null ? insertIndex * TAB_WIDTH : null;

	if (tabs.length === 0) {
		return (
			<div className="group/root-tabs flex h-10 min-w-0 shrink-0 items-stretch border-b border-border bg-background">
				<div className="flex h-full w-10 shrink-0 items-stretch bg-background">
					<AddTabButton renderAddTabMenu={renderAddTabMenu} />
				</div>
				<div className="flex min-w-0 flex-1 items-stretch" />
			</div>
		);
	}

	return (
		<div className="group/root-tabs flex h-10 min-w-0 shrink-0 items-stretch border-b border-border bg-background">
			<div
				ref={setScrollContainerRef}
				className={cn(
					"flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden",
					hasHorizontalOverflow
						? [
								"[scrollbar-width:none]",
								"[&::-webkit-scrollbar]:h-0",
								"group-hover/root-tabs:[scrollbar-width:thin]",
								"group-hover/root-tabs:[&::-webkit-scrollbar]:h-2",
								"group-hover/root-tabs:[&::-webkit-scrollbar-thumb]:border-[2px]",
							].join(" ")
						: "hide-scrollbar",
				)}
			>
				<div ref={tabsTrackRef} className="relative flex h-full items-stretch">
					{tabs.map((tab, i) => (
						<div
							className="h-full shrink-0"
							key={tab.id}
							style={{ width: TAB_WIDTH }}
						>
							<TabItem
								tab={tab}
								index={i}
								isActive={tab.id === activeTabId}
								onSelect={() => onSelectTab(tab.id)}
								onClose={() => onCloseTab(tab.id)}
								onCloseOthers={() => onCloseOtherTabs(tab.id)}
								onCloseAll={onCloseAllTabs}
								onRename={(title) => onRenameTab(tab.id, title)}
								getTitle={getTabTitle}
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
						<div className="flex h-full w-10 shrink-0 items-stretch">
							<AddTabButton renderAddTabMenu={renderAddTabMenu} />
						</div>
					)}
				</div>
			</div>
			{hasHorizontalOverflow && (
				<div className="flex h-full w-10 shrink-0 items-stretch bg-background">
					<AddTabButton renderAddTabMenu={renderAddTabMenu} />
				</div>
			)}
		</div>
	);
}
