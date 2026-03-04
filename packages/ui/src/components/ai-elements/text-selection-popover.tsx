"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

type TextSelectionPopoverAction = {
	label: string;
	onClick: (text: string) => void;
};

type TextSelectionPopoverProps = {
	/** The container element to monitor for text selections. */
	containerRef: React.RefObject<HTMLElement | null>;
	/** Primary action (always shown). */
	primaryAction: TextSelectionPopoverAction;
	/** Optional secondary action (shown with a separator). */
	secondaryAction?: TextSelectionPopoverAction;
	/** Called after any action fires, to refocus the input. */
	onAfterAction?: () => void;
};

const POPOVER_HEIGHT = 28;

export const TextSelectionPopover = ({
	containerRef,
	primaryAction,
	secondaryAction,
	onAfterAction,
}: TextSelectionPopoverProps) => {
	const [selectedText, setSelectedText] = useState("");
	const [rect, setRect] = useState<DOMRect | null>(null);
	const [isVisible, setIsVisible] = useState(false);
	const [isMouseDown, setIsMouseDown] = useState(false);
	const popoverRef = useRef<HTMLDivElement>(null);

	// Track mouse state to show popover only after selection completes
	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (popoverRef.current?.contains(e.target as Node)) return;
			setIsMouseDown(true);
			setIsVisible(false);
		};
		const onUp = (e: MouseEvent) => {
			if (popoverRef.current?.contains(e.target as Node)) return;
			setIsMouseDown(false);
		};

		document.addEventListener("mousedown", onDown);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	// Monitor selection changes
	useEffect(() => {
		const onSelectionChange = () => {
			const sel = document.getSelection();
			const text = sel?.toString().trim() ?? "";

			if (
				!text ||
				!sel?.rangeCount ||
				!containerRef.current?.contains(sel.anchorNode)
			) {
				setSelectedText("");
				setRect(null);
				setIsVisible(false);
				return;
			}

			const range = sel.getRangeAt(0);
			setSelectedText(text);
			setRect(range.getBoundingClientRect());
		};

		document.addEventListener("selectionchange", onSelectionChange);
		return () =>
			document.removeEventListener("selectionchange", onSelectionChange);
	}, [containerRef]);

	// Show when mouse is up and we have a selection
	useEffect(() => {
		if (!isMouseDown && selectedText && rect) {
			setIsVisible(true);
		} else if (!selectedText || !rect) {
			setIsVisible(false);
		}
	}, [isMouseDown, selectedText, rect]);

	const handleAction = useCallback(
		(action: TextSelectionPopoverAction) => {
			if (!selectedText) return;
			action.onClick(selectedText);
			setIsVisible(false);
			document.getSelection()?.removeAllRanges();
			requestAnimationFrame(() => onAfterAction?.());
		},
		[selectedText, onAfterAction],
	);

	if (!isVisible || !rect) return null;

	// Position: centered above selection, below if not enough space
	const viewportWidth = window.innerWidth;
	const estimatedWidth = secondaryAction ? 160 : 100;
	const left = Math.max(
		8,
		Math.min(
			rect.left + rect.width / 2 - estimatedWidth / 2,
			viewportWidth - estimatedWidth - 8,
		),
	);
	const showAbove = rect.top > POPOVER_HEIGHT + 8;
	const top = showAbove ? rect.top - POPOVER_HEIGHT - 4 : rect.bottom + 4;

	const content = (
		<div
			className={cn(
				showAbove
					? "origin-bottom animate-in fade-in-0 zoom-in-95 duration-100"
					: "origin-top animate-in fade-in-0 zoom-in-95 duration-100",
			)}
			ref={popoverRef}
			style={{ position: "fixed", top, left, zIndex: 100000 }}
		>
			<div className="flex items-center gap-0.5 rounded-md border border-border bg-popover px-0.5 py-0.5 shadow-lg">
				<button
					className="rounded px-1.5 py-0.5 text-xs text-popover-foreground transition-colors duration-100 hover:bg-accent active:scale-[0.97]"
					onClick={() => handleAction(primaryAction)}
					type="button"
				>
					{primaryAction.label}
				</button>
				{secondaryAction && (
					<>
						<div className="h-3 w-px bg-border" />
						<button
							className="rounded px-1.5 py-0.5 text-xs text-popover-foreground transition-colors duration-100 hover:bg-accent active:scale-[0.97]"
							onClick={() => handleAction(secondaryAction)}
							type="button"
						>
							{secondaryAction.label}
						</button>
					</>
				)}
			</div>
		</div>
	);

	return content;
};
