import { Button } from "@superset/ui/button";
import { LayoutGroup, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { useDrop } from "react-dnd";
import { HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useSidebarStore } from "renderer/stores";
import { useTabsStore } from "renderer/stores/tabs/store";
import { TabItem } from "./TabItem";

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
	const reorderTabById = useTabsStore((s) => s.reorderTabById);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const containerRef = useRef<HTMLElement>(null);

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const handleAddTab = () => {
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
	};

	// Drop zone for reordering tabs
	const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
		accept: DRAG_TYPE,
		hover: (item, monitor) => {
			if (!containerRef.current) return;

			const clientOffset = monitor.getClientOffset();
			if (!clientOffset) return;

			// Find all tab items in the container
			const tabItems = containerRef.current.querySelectorAll("[data-tab-item]");
			let newDropIndex = tabs.length;

			tabItems.forEach((element, index) => {
				const rect = element.getBoundingClientRect();
				const midY = rect.top + rect.height / 2;

				if (clientOffset.y < midY && index < newDropIndex) {
					newDropIndex = index;
				}
			});

			// Don't show indicator at the dragged item's current position
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

	// Clear drop index when not hovering
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
							{/* Drop line indicator before this tab */}
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
					{/* Drop line indicator at the end */}
					{isOver && dropIndex === tabs.length && (
						<div className="h-0.5 bg-primary rounded-full z-20 pointer-events-none mt-1" />
					)}
				</div>
				<motion.div
					layout={!isResizing}
					transition={{ layout: { duration: 0.2, ease: "easeInOut" } }}
				>
					<Button
						variant="ghost"
						onClick={handleAddTab}
						className="w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between mt-1"
						disabled={!activeWorkspaceId}
					>
						<HiMiniPlus className="size-4" />
						<span className="truncate flex-1">New Terminal</span>
					</Button>
				</motion.div>
			</LayoutGroup>
		</nav>
	);
}
