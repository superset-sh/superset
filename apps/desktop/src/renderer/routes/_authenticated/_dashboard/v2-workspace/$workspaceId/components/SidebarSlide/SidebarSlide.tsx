import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";

export type SidebarSlideMode = "closed" | "open" | "expanded";

interface SidebarSlideProps {
	mode: SidebarSlideMode;
	width: number;
	expandedWidth: number;
	onLayoutFrame?: () => void;
	keepMounted?: boolean;
	durationMs?: number;
	children: (fill: boolean) => React.ReactNode;
}

export function SidebarSlide({
	mode,
	width,
	expandedWidth,
	onLayoutFrame,
	keepMounted = false,
	durationMs = 300,
	children,
}: SidebarSlideProps) {
	const [settled, setSettled] = useState<SidebarSlideMode>(mode);
	const [move, setMove] = useState<{
		from: SidebarSlideMode;
		to: SidebarSlideMode;
	} | null>(null);
	const [armed, setArmed] = useState(false);
	const [hasOpened, setHasOpened] = useState(mode !== "closed");
	const headingRef = useRef(mode);
	const onLayoutFrameRef = useRef(onLayoutFrame);
	onLayoutFrameRef.current = onLayoutFrame;

	useEffect(() => {
		const from = headingRef.current;
		if (from === mode) return;
		headingRef.current = mode;
		if (mode !== "closed") setHasOpened(true);
		setMove({ from, to: mode });
		setArmed(false);
		let frame = requestAnimationFrame(() => {
			frame = requestAnimationFrame(() => setArmed(true));
		});
		let layoutFrame = requestAnimationFrame(function follow() {
			onLayoutFrameRef.current?.();
			layoutFrame = requestAnimationFrame(follow);
		});
		const timer = setTimeout(() => {
			cancelAnimationFrame(layoutFrame);
			setSettled(mode);
			setMove(null);
		}, durationMs);
		return () => {
			cancelAnimationFrame(frame);
			cancelAnimationFrame(layoutFrame);
			clearTimeout(timer);
		};
	}, [mode, durationMs]);

	useEffect(() => {
		if (!move) onLayoutFrameRef.current?.();
	}, [move]);

	if (!hasOpened) return null;
	if (!keepMounted && !move && settled === "closed") return null;

	// Settled open lays the panel out in flow so a drag-resize sizes everything
	// from the panel itself. The element tree stays the same in every mode, so
	// switching never remounts the panes.
	const inFlow = !move && settled === "open";
	const hidden = !move && settled === "closed";
	const widthOf = (m: SidebarSlideMode) =>
		m === "closed" ? 0 : m === "open" ? width : expandedWidth;
	const spaceOf = (m: SidebarSlideMode) => (m === "closed" ? 0 : width);
	const fill = move
		? move.from === "expanded" || move.to === "expanded"
		: settled === "expanded";
	const spaceWidth = move
		? spaceOf(armed ? move.to : move.from)
		: spaceOf(settled);
	const panelWidth = move
		? widthOf(armed ? move.to : move.from)
		: widthOf(settled);
	const contentWidth = fill
		? "100%"
		: move
			? Math.max(width, widthOf(move.from), widthOf(move.to))
			: width;
	const transition = {
		transitionProperty: "width",
		transitionDuration: move && armed ? `${durationMs}ms` : "0ms",
		willChange: move ? "width" : undefined,
	};

	return (
		<div
			className="relative flex h-full shrink-0 ease-[ease] motion-reduce:transition-none"
			style={{ width: inFlow ? undefined : spaceWidth, ...transition }}
		>
			<div
				className={cn(
					"overflow-hidden ease-[ease] motion-reduce:transition-none",
					inFlow ? "flex h-full" : "absolute inset-y-0 right-0 z-30",
				)}
				style={{ width: inFlow ? undefined : panelWidth, ...transition }}
			>
				<div
					inert={hidden}
					className={cn(
						"flex",
						inFlow ? "h-full" : "absolute inset-y-0 right-0",
						hidden && "invisible",
					)}
					style={{
						width: inFlow ? undefined : contentWidth,
						contain: move ? "strict" : undefined,
					}}
				>
					{children(fill)}
				</div>
			</div>
		</div>
	);
}
