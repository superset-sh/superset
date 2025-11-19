import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import {
	useRemoveTab,
	useSetActiveTab,
	useTabsStore,
	useWorkspacesStore,
} from "renderer/stores";

interface TabItemProps {
	tabId: string;
	title: string;
	isActive: boolean;
}

export function TabItem({ tabId, title, isActive }: TabItemProps) {
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const removeTab = useRemoveTab();
	const setActiveTab = useSetActiveTab();
	const dragTabToTab = useTabsStore((state) => state.dragTabToTab);

	const [isDragging, setIsDragging] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);

	const handleRemoveTab = (e: React.MouseEvent) => {
		e.stopPropagation();
		removeTab(tabId);
	};

	const handleTabClick = () => {
		if (activeWorkspaceId) {
			setActiveTab(activeWorkspaceId, tabId);
		}
	};

	const handleDragStart = (e: React.DragEvent) => {
		setIsDragging(true);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("application/x-tab-id", tabId);
	};

	const handleDragEnd = () => {
		setIsDragging(false);
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	};

	const handleDragEnter = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	};

	const handleDragLeave = () => {
		setIsDragOver(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);

		const draggedTabId = e.dataTransfer.getData("application/x-tab-id");
		if (draggedTabId && draggedTabId !== tabId) {
			dragTabToTab(draggedTabId, tabId);
		}
	};

	return (
		<Button
			variant="ghost"
			onClick={handleTabClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleTabClick();
				}
			}}
			draggable
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragOver={handleDragOver}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			tabIndex={0}
			className={`
				w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between
				${isActive ? "bg-sidebar-accent" : ""}
				${isDragging ? "opacity-50" : ""}
				${isDragOver ? "ring-2 ring-primary" : ""}
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
