import type { SplitPosition } from "../../../../../../../../../types";

interface DropZoneOverlayProps {
	position: SplitPosition | null;
}

const ZONE_STYLES: Record<SplitPosition, React.CSSProperties> = {
	top: { top: 0, left: 0, width: "100%", height: "50%" },
	bottom: { top: "50%", left: 0, width: "100%", height: "50%" },
	left: { top: 0, left: 0, width: "50%", height: "100%" },
	right: { top: 0, left: "50%", width: "50%", height: "100%" },
};

export function DropZoneOverlay({ position }: DropZoneOverlayProps) {
	if (!position) return null;

	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<div
				className="absolute rounded-sm border-2 border-primary/70 bg-primary/10"
				style={{
					...ZONE_STYLES[position],
					transition: "all 150ms ease",
				}}
			/>
		</div>
	);
}
