import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import "./DashboardSidebarCloudHoverOverlay.css";

interface DashboardSidebarCloudHoverOverlayProps {
	anchor: HTMLElement | null;
	onPointerEnter: () => void;
	onPointerLeave: () => void;
	onClose: () => void;
	children: ReactNode;
}

export function DashboardSidebarCloudHoverOverlay({
	anchor,
	onPointerEnter,
	onPointerLeave,
	onClose,
	children,
}: DashboardSidebarCloudHoverOverlayProps) {
	const anchorRef = useRef<HTMLElement | null>(null);
	anchorRef.current = anchor;
	const open = anchor !== null;

	// Radix first places the popover off-screen to measure it; gliding from
	// there would fly it in from the top.
	const [isPlaced, setIsPlaced] = useState(false);
	useEffect(() => {
		if (!open) {
			setIsPlaced(false);
			return;
		}
		let second = 0;
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() => setIsPlaced(true));
		});
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
		};
	}, [open]);

	useEffect(() => {
		if (anchor && !anchor.isConnected) onClose();
	}, [anchor, onClose]);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onClose();
			}}
		>
			<PopoverAnchor virtualRef={anchorRef as RefObject<HTMLElement>} />
			{open && (
				<PopoverContent
					side="right"
					align="start"
					sideOffset={8}
					className="w-80 p-2"
					data-cloud-hover-card={isPlaced ? "placed" : ""}
					onOpenAutoFocus={(event) => event.preventDefault()}
					onPointerEnter={onPointerEnter}
					onPointerLeave={onPointerLeave}
				>
					{children}
				</PopoverContent>
			)}
		</Popover>
	);
}
