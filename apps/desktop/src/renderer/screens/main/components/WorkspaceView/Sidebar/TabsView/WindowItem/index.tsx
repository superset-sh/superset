import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useWindowsStore } from "renderer/stores/tabs/store";
import type { Window } from "renderer/stores/tabs/types";
import { getWindowDisplayName } from "renderer/stores/tabs/utils";
import { WindowContextMenu } from "./WindowContextMenu";

const DRAG_TYPE = "WINDOW";

interface DragItem {
	type: typeof DRAG_TYPE;
	windowId: string;
	index: number;
}

interface WindowItemProps {
	window: Window;
	index: number;
	isActive: boolean;
}

export function WindowItem({ window, index, isActive }: WindowItemProps) {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const removeWindow = useWindowsStore((s) => s.removeWindow);
	const setActiveWindow = useWindowsStore((s) => s.setActiveWindow);
	const renameWindow = useWindowsStore((s) => s.renameWindow);
	const needsAttention = useWindowsStore((s) =>
		Object.values(s.panes).some(
			(p) => p.windowId === window.id && p.needsAttention,
		),
	);

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	// Drag source for window reordering
	const [{ isDragging }, drag] = useDrag<
		DragItem,
		void,
		{ isDragging: boolean }
	>({
		type: DRAG_TYPE,
		item: { type: DRAG_TYPE, windowId: window.id, index },
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

	const displayName = getWindowDisplayName(window);

	const handleRemoveWindow = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		removeWindow(window.id);
	};

	const handleWindowClick = () => {
		if (isRenaming) return;
		if (activeWorkspaceId) {
			setActiveWindow(activeWorkspaceId, window.id);
		}
	};

	const startRename = () => {
		setRenameValue(window.name || displayName);
		setIsRenaming(true);
		setTimeout(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		}, 0);
	};

	const submitRename = () => {
		const trimmedValue = renameValue.trim();
		// Only update if the name actually changed
		if (trimmedValue && trimmedValue !== window.name) {
			renameWindow(window.id, trimmedValue);
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
			<WindowContextMenu onClose={handleRemoveWindow} onRename={startRename}>
				<Button
					ref={attachRef}
					variant="ghost"
					onClick={handleWindowClick}
					onDoubleClick={startRename}
					onKeyDown={(e) => {
						if (!isRenaming && (e.key === "Enter" || e.key === " ")) {
							e.preventDefault();
							handleWindowClick();
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
						onClick={handleRemoveWindow}
						className="cursor-pointer opacity-0 group-hover:opacity-100 ml-2 text-xs shrink-0"
					>
						<HiMiniXMark className="size-4" />
					</button>
				</Button>
			</WindowContextMenu>
		</div>
	);
}
