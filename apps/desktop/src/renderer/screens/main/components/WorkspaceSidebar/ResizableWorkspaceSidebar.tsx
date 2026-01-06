import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef } from "react";
import {
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	MIN_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function ResizableWorkspaceSidebar() {
	const { isOpen, width, setWidth, isResizing, setIsResizing } =
		useWorkspaceSidebarStore();

	const startXRef = useRef(0);
	const startWidthRef = useRef(0);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			startXRef.current = e.clientX;
			startWidthRef.current = width;
			setIsResizing(true);
		},
		[width, setIsResizing],
	);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizing) return;

			const delta = e.clientX - startXRef.current;
			const newWidth = startWidthRef.current + delta;
			const clampedWidth = Math.max(
				MIN_WORKSPACE_SIDEBAR_WIDTH,
				Math.min(MAX_WORKSPACE_SIDEBAR_WIDTH, newWidth),
			);
			setWidth(clampedWidth);
		},
		[isResizing, setWidth],
	);

	const handleMouseUp = useCallback(() => {
		if (isResizing) {
			setIsResizing(false);
		}
	}, [isResizing, setIsResizing]);

	useEffect(() => {
		if (isResizing) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";
		}

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		};
	}, [isResizing, handleMouseMove, handleMouseUp]);

	if (!isOpen) {
		return null;
	}

	return (
		<div
			className="relative h-full flex-shrink-0 overflow-hidden border-r border-border"
			style={{ width }}
		>
			<WorkspaceSidebar />

			{/* Resize handle */}
			{/* biome-ignore lint/a11y/useSemanticElements: <hr> is not appropriate for interactive resize handles */}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-valuenow={width}
				aria-valuemin={MIN_WORKSPACE_SIDEBAR_WIDTH}
				aria-valuemax={MAX_WORKSPACE_SIDEBAR_WIDTH}
				tabIndex={0}
				onMouseDown={handleMouseDown}
				className={cn(
					"absolute top-0 -right-2 w-5 h-full cursor-col-resize z-10",
					"after:absolute after:top-0 after:left-2 after:w-1 after:h-full after:transition-colors",
					"hover:after:bg-border focus:outline-none focus:after:bg-border",
					isResizing && "after:bg-border",
				)}
			/>
		</div>
	);
}
