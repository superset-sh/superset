import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef } from "react";
import { useSidebarStore } from "renderer/stores";
import {
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
} from "renderer/stores/sidebar-state";
import { Sidebar } from "../Sidebar";

export function ResizableSidebar() {
	const {
		isSidebarOpen,
		sidebarWidth,
		setSidebarWidth,
		isResizing,
		setIsResizing,
	} = useSidebarStore();

	const startXRef = useRef(0);
	const startWidthRef = useRef(0);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			startXRef.current = e.clientX;
			startWidthRef.current = sidebarWidth;
			setIsResizing(true);
		},
		[sidebarWidth, setIsResizing],
	);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizing) return;

			const draggedLeftBy = startXRef.current - e.clientX;
			const newWidth = startWidthRef.current + draggedLeftBy;
			const clampedWidth = Math.max(
				MIN_SIDEBAR_WIDTH,
				Math.min(MAX_SIDEBAR_WIDTH, newWidth),
			);
			setSidebarWidth(clampedWidth);
		},
		[isResizing, setSidebarWidth],
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

	if (!isSidebarOpen) {
		return null;
	}

	return (
		<div
			className="relative h-full flex-shrink-0 overflow-hidden"
			style={{ width: sidebarWidth }}
		>
			<Sidebar />

			{/* biome-ignore lint/a11y/useSemanticElements: <hr> is not appropriate for interactive resize handles */}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-valuenow={sidebarWidth}
				aria-valuemin={MIN_SIDEBAR_WIDTH}
				aria-valuemax={MAX_SIDEBAR_WIDTH}
				tabIndex={0}
				onMouseDown={handleMouseDown}
				className={cn(
					"absolute top-0 -left-2 w-5 h-full cursor-col-resize z-10",
					"after:absolute after:top-0 after:right-2 after:w-1 after:h-full after:transition-colors",
					"hover:after:bg-border focus:outline-none focus:after:bg-border",
					isResizing && "after:bg-border",
				)}
			/>
		</div>
	);
}
