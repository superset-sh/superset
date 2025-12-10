import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniCommandLine, HiMiniXMark } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";
import { TabContextMenu } from "./TabContextMenu";

const DRAG_TYPE = "TAB";

interface DragItem {
	type: typeof DRAG_TYPE;
	tabId: string;
	index: number;
}

interface TabItemProps {
	tab: Tab;
	index: number;
	isActive: boolean;
}

export function TabItem({ tab, index, isActive }: TabItemProps) {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const removeTab = useTabsStore((s) => s.removeTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const renameTab = useTabsStore((s) => s.renameTab);
	const needsAttention = useTabsStore((s) =>
		Object.values(s.panes).some((p) => p.tabId === tab.id && p.needsAttention),
	);

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	// Drag source for tab reordering
	const [{ isDragging }, drag] = useDrag<
		DragItem,
		void,
		{ isDragging: boolean }
	>({
		type: DRAG_TYPE,
		item: { type: DRAG_TYPE, tabId: tab.id, index },
		collect: (monitor) => ({
			isDragging: monitor.isDragging(),
		}),
	});

	// Drop target (just for visual feedback, actual drop is handled by parent)
	const [{ isDragOver }, drop] = useDrop<
		DragItem,
		void,
		{ isDragOver: boolean }
	>({
		accept: DRAG_TYPE,
		collect: (monitor) => ({
			isDragOver: monitor.isOver(),
		}),
	});

	const displayName = getTabDisplayName(tab);

	const handleRemoveTab = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		removeTab(tab.id);
	};

	const handleTabClick = () => {
		if (isRenaming) return;
		if (activeWorkspaceId) {
			setActiveTab(activeWorkspaceId, tab.id);
		}
	};

	const startRename = () => {
		setRenameValue(tab.userTitle ?? tab.name ?? displayName);
		setIsRenaming(true);
		setTimeout(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		}, 0);
	};

	const submitRename = () => {
		const trimmedValue = renameValue.trim();
		const currentUserTitle = tab.userTitle?.trim() ?? "";
		if (trimmedValue !== currentUserTitle) {
			renameTab(tab.id, trimmedValue);
		}
		setIsRenaming(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submitRename();
		} else if (e.key === "Escape") {
			setIsRenaming(false);
		}
	};

	const attachRef = (el: HTMLButtonElement | null) => {
		drag(el);
		drop(el);
	};

	return (
		<div className="w-full">
			<TabContextMenu
				tab={tab}
				onClose={handleRemoveTab}
				onRename={startRename}
			>
				<Button
					ref={attachRef}
					variant="ghost"
					onClick={handleTabClick}
					onDoubleClick={startRename}
					onKeyDown={(e) => {
						if (!isRenaming && (e.key === "Enter" || e.key === " ")) {
							e.preventDefault();
							handleTabClick();
						}
					}}
					tabIndex={0}
					className={`
					w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between
					${isActive ? "bg-tertiary-active" : ""}
					${isDragging ? "opacity-50" : ""}
					${isDragOver ? "bg-tertiary-active/50" : ""}
				`}
				>
					<HiMiniCommandLine className="size-4" />
					<div className="flex items-center gap-1 flex-1 min-w-0">
						{isRenaming ? (
							<Input
								ref={inputRef}
								variant="ghost"
								value={renameValue}
								onChange={(e) => setRenameValue(e.target.value)}
								onBlur={submitRename}
								onKeyDown={handleKeyDown}
								onClick={(e) => e.stopPropagation()}
								className="flex-1"
							/>
						) : (
							<>
								<span className="truncate flex-1">{displayName}</span>
								{needsAttention && (
									<span
										className="relative flex size-2 shrink-0 ml-1"
										title="Agent completed"
									>
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
										<span className="relative inline-flex size-2 rounded-full bg-red-500" />
									</span>
								)}
							</>
						)}
					</div>
					<button
						type="button"
						tabIndex={-1}
						onClick={handleRemoveTab}
						className="cursor-pointer opacity-0 group-hover:opacity-100 ml-2 text-xs shrink-0"
					>
						<HiMiniXMark className="size-4" />
					</button>
				</Button>
			</TabContextMenu>
		</div>
	);
}
