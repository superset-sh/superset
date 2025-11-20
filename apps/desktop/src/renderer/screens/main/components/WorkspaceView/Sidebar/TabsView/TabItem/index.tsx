import { Button } from "@superset/ui/button";
import { HiMiniXMark } from "react-icons/hi2";
import {
	useRemoveTab,
	useSetActiveTab,
	useWorkspacesStore,
} from "renderer/stores";
import type { TabItemProps } from "./types";
import { useDragTab } from "./useDragTab";

export function TabItem({ tabId, title, isActive }: TabItemProps) {
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const removeTab = useRemoveTab();
	const setActiveTab = useSetActiveTab();

	const { drag, drop, isDragging, isDragOver } = useDragTab(tabId);

	const handleRemoveTab = (e: React.MouseEvent) => {
		e.stopPropagation();
		removeTab(tabId);
	};

	const handleTabClick = () => {
		if (activeWorkspaceId) {
			setActiveTab(activeWorkspaceId, tabId);
		}
	};

	// Combine drag and drop refs
	const attachRef = (el: HTMLButtonElement | null) => {
		drag(el);
		drop(el);
	};

	return (
		<Button
			ref={attachRef}
			variant="ghost"
			onClick={handleTabClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleTabClick();
				}
			}}
			tabIndex={0}
			className={`
				w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between
				${isActive ? "bg-sidebar-accent" : ""}
				${isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"}
				${isDragOver ? "ring-2 ring-primary bg-sidebar-accent/50" : ""}
			`}
		>
			<span className="truncate flex-1">{title}</span>
			<button
				type="button"
				onClick={handleRemoveTab}
				className="opacity-0 group-hover:opacity-100 ml-2 text-xs hover:text-destructive"
			>
				<HiMiniXMark className="size-4" />
			</button>
		</Button>
	);
}
