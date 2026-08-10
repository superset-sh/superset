import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useDiffStats } from "renderer/hooks/host-service/useDiffStats";
import { useDashboardSidebarHover } from "../../providers/DashboardSidebarHoverProvider";
import { DashboardSidebarWorkspaceHoverCardContent } from "../DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceHoverCardContent";
import "./DashboardSidebarHoverCardOverlay.css";

type Measurable = { getBoundingClientRect(): DOMRect };

export function DashboardSidebarHoverCardOverlay({
	children,
}: {
	children: React.ReactNode;
}) {
	const {
		hoveredId,
		anchorElement,
		payload,
		contextMenuOpen,
		hoverCardSuppressed,
		cancelClose,
		requestClose,
		forceClose,
		setCardElement,
	} = useDashboardSidebarHover();

	const virtualRef = useRef<Measurable | null>(null);
	virtualRef.current = anchorElement;

	const open =
		hoveredId !== null &&
		payload !== null &&
		!contextMenuOpen &&
		!hoverCardSuppressed;
	const diffStats = useDiffStats(hoveredId ?? "");

	// Suppress the transform transition until Radix has placed the popover at
	// its real anchor — otherwise the initial jump from the off-screen measuring
	// position (translate(0, -200%)) gets animated.
	const [hasPositioned, setHasPositioned] = useState(false);
	const frameRef = useRef<number | null>(null);
	useEffect(() => {
		if (!open) {
			setHasPositioned(false);
			return;
		}
		const first = requestAnimationFrame(() => {
			frameRef.current = requestAnimationFrame(() => setHasPositioned(true));
		});
		frameRef.current = first;
		return () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		};
	}, [open]);

	// Register the rendered card element so the hover provider can read its
	// live bounding box (not a cached snapshot — the popover has a CSS
	// entrance transition, so its rect keeps changing after it mounts) when
	// computing the safe-triangle gap between a trigger row and this card.
	// Gated on `hasPositioned`, not just `open` — Radix doesn't insert the
	// content node into the DOM until a frame or two after `open` flips true.
	const contentRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		setCardElement(open && hasPositioned ? contentRef.current : null);
		return () => setCardElement(null);
	}, [open, hasPositioned, setCardElement]);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) forceClose();
			}}
		>
			{children}
			<PopoverAnchor virtualRef={virtualRef as RefObject<Measurable>} />
			{payload && (
				<PopoverContent
					ref={contentRef}
					side="right"
					align="start"
					className="w-72"
					data-dashboard-sidebar-hover-card={hasPositioned ? "ready" : ""}
					onOpenAutoFocus={(event) => event.preventDefault()}
					onPointerEnter={cancelClose}
					onPointerLeave={() => {
						if (hoveredId) requestClose(hoveredId);
					}}
				>
					<DashboardSidebarWorkspaceHoverCardContent
						workspace={payload.workspace}
						diffStats={diffStats}
						onEditBranchClick={payload.onEditBranchClick}
					/>
				</PopoverContent>
			)}
		</Popover>
	);
}
