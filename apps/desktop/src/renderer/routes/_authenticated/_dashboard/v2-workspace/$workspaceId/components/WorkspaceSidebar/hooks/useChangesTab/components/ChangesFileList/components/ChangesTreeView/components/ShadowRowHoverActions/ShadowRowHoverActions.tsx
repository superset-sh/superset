import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";

interface ShadowRowHoverActionsProps {
	/**
	 * Walk a mouse event's composed path to find the hovered file row, or null
	 * for folder rows / empty space. Pierre owns the row DOM inside an open
	 * shadow root, so per-row hover containers aren't possible — we anchor a
	 * single light-DOM overlay over the hovered row's bounding rect instead.
	 */
	findFileRow: (e: React.MouseEvent) => HTMLElement | null;
	/** Inline action buttons (e.g. Discard) for the row at `treePath`. */
	renderInlineActions?: (treePath: string) => ReactNode;
	/** Items for the more-actions ⌄ dropdown for the row at `treePath`. */
	renderMenuContent: (treePath: string) => ReactNode;
	children: ReactNode;
}

/**
 * Anchors a hover-actions overlay over the file row currently under the mouse
 * inside `children`. Owns the more-actions dropdown so the overlay stays
 * mounted while that dropdown is open (closing the overlay mid-open would tear
 * the dropdown down).
 */
export function ShadowRowHoverActions({
	findFileRow,
	renderInlineActions,
	renderMenuContent,
	children,
}: ShadowRowHoverActionsProps) {
	const [hover, setHover] = useState<{
		rect: DOMRect;
		treePath: string;
	} | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const hoverRowRef = useRef<HTMLElement | null>(null);

	const handleMouseOver = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (menuOpen) return;
			const row = findFileRow(e);
			if (!row) {
				if (hoverRowRef.current) {
					hoverRowRef.current = null;
					setHover(null);
				}
				return;
			}
			if (hoverRowRef.current === row) return;
			const treePath = row.getAttribute("data-item-path");
			if (!treePath) return;
			hoverRowRef.current = row;
			setHover({ rect: row.getBoundingClientRect(), treePath });
		},
		[findFileRow, menuOpen],
	);

	const handleMouseLeave = useCallback(() => {
		if (menuOpen) return;
		hoverRowRef.current = null;
		setHover(null);
	}, [menuOpen]);

	// Scrolling the virtualized list moves rows out from under the captured
	// rect, so drop the overlay (it re-anchors on the next mouseover). Skip
	// while the dropdown is open — closing the overlay would tear it down.
	const handleScrollCapture = useCallback(() => {
		if (menuOpen || !hoverRowRef.current) return;
		hoverRowRef.current = null;
		setHover(null);
	}, [menuOpen]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: wraps a custom-element host with its own keyboard nav
		// biome-ignore lint/a11y/useKeyWithMouseEvents: hover-action anchoring is mouse-only by nature
		<div
			className="contents"
			onMouseOver={handleMouseOver}
			onMouseLeave={handleMouseLeave}
			onScrollCapture={handleScrollCapture}
		>
			{children}
			{hover && (
				<div
					aria-hidden
					style={{
						position: "fixed",
						left: hover.rect.left,
						top: hover.rect.top,
						width: hover.rect.width,
						height: hover.rect.height,
						pointerEvents: "none",
					}}
				>
					<div className="pointer-events-auto absolute inset-y-0 right-2 flex items-center gap-0.5">
						{renderInlineActions?.(hover.treePath)}
						<DropdownMenu
							open={menuOpen}
							onOpenChange={(open) => {
								setMenuOpen(open);
								if (!open) {
									hoverRowRef.current = null;
									setHover(null);
								}
							}}
						>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									aria-label="More actions"
									className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
									onClick={(e) => e.stopPropagation()}
								>
									<ChevronDown className="size-3.5" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-64">
								{renderMenuContent(hover.treePath)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			)}
		</div>
	);
}
