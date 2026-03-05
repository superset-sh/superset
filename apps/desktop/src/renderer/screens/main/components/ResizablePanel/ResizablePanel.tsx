import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef } from "react";

interface ResizablePanelProps {
	/** The content to render inside the panel */
	children: React.ReactNode;
	/** Current width of the panel */
	width: number;
	/** Callback when width changes */
	onWidthChange: (width: number) => void;
	/** Whether the panel is currently being resized */
	isResizing: boolean;
	/** Callback when resizing state changes */
	onResizingChange: (isResizing: boolean) => void;
	/** Minimum allowed width (used for clamping and aria) */
	minWidth: number;
	/** Maximum allowed width (used for clamping and aria) */
	maxWidth: number;
	/** Which side the resize handle should be on */
	handleSide: "left" | "right";
	/** Additional className for the container */
	className?: string;
	/**
	 * If true, the component will clamp width between minWidth and maxWidth.
	 * If false, raw width values are passed to onWidthChange (useful when the
	 * consumer's setWidth handles clamping/snapping logic).
	 * @default true
	 */
	clampWidth?: boolean;
}

export function ResizablePanel({
	children,
	width,
	onWidthChange,
	isResizing,
	onResizingChange,
	minWidth,
	maxWidth,
	handleSide,
	className,
	clampWidth = true,
}: ResizablePanelProps) {
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);
	const pendingWidthRef = useRef<number | null>(null);
	const rafIdRef = useRef<number | null>(null);

	const flushPendingWidth = useCallback(() => {
		const pendingWidth = pendingWidthRef.current;
		pendingWidthRef.current = null;
		if (pendingWidth === null) return;
		onWidthChange(pendingWidth);
	}, [onWidthChange]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			startXRef.current = e.clientX;
			startWidthRef.current = width;
			onResizingChange(true);
		},
		[width, onResizingChange],
	);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizing) return;

			const delta = e.clientX - startXRef.current;
			// For left handle, dragging left increases width (invert delta)
			// For right handle, dragging right increases width (normal delta)
			const adjustedDelta = handleSide === "left" ? -delta : delta;
			const newWidth = startWidthRef.current + adjustedDelta;
			const finalWidth = clampWidth
				? Math.max(minWidth, Math.min(maxWidth, newWidth))
				: newWidth;
			pendingWidthRef.current = finalWidth;

			if (rafIdRef.current !== null) return;
			rafIdRef.current = requestAnimationFrame(() => {
				rafIdRef.current = null;
				flushPendingWidth();
			});
		},
		[isResizing, minWidth, maxWidth, handleSide, clampWidth, flushPendingWidth],
	);

	const handleMouseUp = useCallback(() => {
		if (!isResizing) return;

		if (rafIdRef.current !== null) {
			cancelAnimationFrame(rafIdRef.current);
			rafIdRef.current = null;
		}
		flushPendingWidth();
		onResizingChange(false);
	}, [isResizing, onResizingChange, flushPendingWidth]);

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
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
			}
			pendingWidthRef.current = null;
		};
	}, [isResizing, handleMouseMove, handleMouseUp]);

	return (
		<div
			className={cn(
				"relative h-full shrink-0 overflow-hidden border-border",
				handleSide === "right" ? "border-r" : "border-l",
				className,
			)}
			style={{ width }}
		>
			{children}
			{/* biome-ignore lint/a11y/useSemanticElements: <hr> is not appropriate for interactive resize handles */}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-valuenow={width}
				aria-valuemin={minWidth}
				aria-valuemax={maxWidth}
				tabIndex={0}
				onMouseDown={handleMouseDown}
				className={cn(
					"absolute top-0 w-5 h-full cursor-col-resize z-10",
					"after:absolute after:top-0 after:w-1 after:h-full after:transition-colors",
					"hover:after:bg-border focus:outline-none focus:after:bg-border",
					isResizing && "after:bg-border",
					handleSide === "left"
						? "-left-2 after:right-2"
						: "-right-2 after:left-2",
				)}
			/>
		</div>
	);
}
