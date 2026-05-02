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
		cancelClose,
		requestClose,
		forceClose,
	} = useDashboardSidebarHover();

	const virtualRef = useRef<Measurable | null>(null);
	virtualRef.current = anchorElement;

	const open = hoveredId !== null && payload !== null && !contextMenuOpen;
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
