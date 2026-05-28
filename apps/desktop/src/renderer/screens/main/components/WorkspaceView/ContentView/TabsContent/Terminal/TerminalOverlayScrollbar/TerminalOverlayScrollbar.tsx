import { cn } from "@superset/ui/utils";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface TerminalOverlayScrollbarProps {
	backgroundColor?: string;
	controlsId: string;
	terminal: XTerm | null | undefined;
}

interface ScrollMetrics {
	isScrollable: boolean;
	maxScroll: number;
	thumbHeightPercent: number;
	thumbTopPercent: number;
	viewportY: number;
}

const MIN_THUMB_HEIGHT_PERCENT = 8;
const DEFAULT_SCROLL_METRICS: ScrollMetrics = {
	isScrollable: false,
	maxScroll: 0,
	thumbHeightPercent: 100,
	thumbTopPercent: 0,
	viewportY: 0,
};

interface ScrollbarStyle extends CSSProperties {
	"--terminal-scrollbar-rail": string;
	"--terminal-scrollbar-thumb": string;
	"--terminal-scrollbar-thumb-hover": string;
}

function parseColor(
	color: string | undefined,
): [number, number, number] | null {
	if (!color) return null;

	const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hex) {
		const value = hex[1];
		const normalized =
			value.length === 3
				? value
						.split("")
						.map((char) => char + char)
						.join("")
				: value;
		return [
			Number.parseInt(normalized.slice(0, 2), 16),
			Number.parseInt(normalized.slice(2, 4), 16),
			Number.parseInt(normalized.slice(4, 6), 16),
		];
	}

	const rgb = color.match(
		/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i,
	);
	if (!rgb) return null;

	return [
		Number.parseInt(rgb[1], 10),
		Number.parseInt(rgb[2], 10),
		Number.parseInt(rgb[3], 10),
	];
}

function isLightBackground(color: string | undefined): boolean {
	const rgb = parseColor(color);
	if (!rgb) return false;
	const [red, green, blue] = rgb;
	return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.6;
}

function getScrollbarStyle(
	backgroundColor: string | undefined,
): ScrollbarStyle {
	if (isLightBackground(backgroundColor)) {
		return {
			"--terminal-scrollbar-rail": "rgba(39, 39, 42, 0.04)",
			"--terminal-scrollbar-thumb": "rgba(113, 113, 122, 0.46)",
			"--terminal-scrollbar-thumb-hover": "rgba(82, 82, 91, 0.58)",
		};
	}

	return {
		"--terminal-scrollbar-rail": "rgba(255, 255, 255, 0.04)",
		"--terminal-scrollbar-thumb": "rgba(255, 255, 255, 0.18)",
		"--terminal-scrollbar-thumb-hover": "rgba(255, 255, 255, 0.3)",
	};
}

function readScrollMetrics(terminal: XTerm | null | undefined): ScrollMetrics {
	if (!terminal) return DEFAULT_SCROLL_METRICS;

	const buffer = terminal.buffer.active;
	const maxScroll = buffer.baseY;
	if (maxScroll <= 0) return DEFAULT_SCROLL_METRICS;

	const totalRows = Math.max(buffer.length, terminal.rows);
	const thumbHeightPercent = Math.max(
		MIN_THUMB_HEIGHT_PERCENT,
		Math.min(100, (terminal.rows / totalRows) * 100),
	);
	const maxThumbTopPercent = 100 - thumbHeightPercent;
	const thumbTopPercent =
		maxScroll > 0 ? (buffer.viewportY / maxScroll) * maxThumbTopPercent : 0;

	return {
		isScrollable: true,
		maxScroll,
		thumbHeightPercent,
		thumbTopPercent,
		viewportY: buffer.viewportY,
	};
}

export function TerminalOverlayScrollbar({
	backgroundColor,
	controlsId,
	terminal,
}: TerminalOverlayScrollbarProps) {
	const railRef = useRef<HTMLDivElement | null>(null);
	const dragOffsetRef = useRef(0);
	const [isDragging, setIsDragging] = useState(false);
	const [metrics, setMetrics] = useState<ScrollMetrics>(() =>
		readScrollMetrics(terminal),
	);

	const updateMetrics = useCallback(() => {
		setMetrics(readScrollMetrics(terminal));
	}, [terminal]);

	const scrollToPointer = useCallback(
		(clientY: number, dragOffset = 0) => {
			if (!terminal || !railRef.current || metrics.maxScroll <= 0) return;
			const railRect = railRef.current.getBoundingClientRect();
			const thumbHeight = railRect.height * (metrics.thumbHeightPercent / 100);
			const maxThumbTop = Math.max(0, railRect.height - thumbHeight);
			if (maxThumbTop <= 0) return;

			const thumbTop = Math.min(
				Math.max(0, clientY - railRect.top - dragOffset),
				maxThumbTop,
			);
			const scrollRatio = thumbTop / maxThumbTop;
			terminal.scrollToLine(Math.round(scrollRatio * metrics.maxScroll));
			setMetrics(readScrollMetrics(terminal));
		},
		[metrics.maxScroll, metrics.thumbHeightPercent, terminal],
	);

	useEffect(() => {
		if (!terminal) {
			setMetrics(DEFAULT_SCROLL_METRICS);
			return;
		}

		updateMetrics();
		const disposables = [
			terminal.onScroll(updateMetrics),
			terminal.onResize(updateMetrics),
			terminal.onWriteParsed(updateMetrics),
			terminal.buffer.onBufferChange(updateMetrics),
		];

		return () => {
			for (const disposable of disposables) {
				disposable.dispose();
			}
		};
	}, [terminal, updateMetrics]);

	if (!terminal || !metrics.isScrollable) return null;

	const scrollbarStyle = getScrollbarStyle(backgroundColor);

	return (
		<div
			ref={railRef}
			className={cn(
				"group/terminal-overlay-scrollbar pointer-events-none absolute top-2 right-0 bottom-2 z-20 w-2 rounded-full opacity-0 transition-opacity duration-150 hover:bg-[var(--terminal-scrollbar-rail)]",
				"group-hover/terminal-scroll:pointer-events-auto group-hover/terminal-scroll:opacity-100 group-focus-within/terminal-scroll:pointer-events-auto group-focus-within/terminal-scroll:opacity-100",
				isDragging && "pointer-events-auto opacity-100",
			)}
			style={scrollbarStyle}
			onPointerDown={(event) => {
				if (event.target !== event.currentTarget) return;
				event.preventDefault();
				const railRect = event.currentTarget.getBoundingClientRect();
				const thumbHeight =
					railRect.height * (metrics.thumbHeightPercent / 100);
				scrollToPointer(event.clientY, thumbHeight / 2);
			}}
		>
			<div
				role="scrollbar"
				aria-controls={controlsId}
				aria-label="Terminal scrollback"
				aria-orientation="vertical"
				aria-valuemin={0}
				aria-valuemax={metrics.maxScroll}
				aria-valuenow={metrics.viewportY}
				tabIndex={0}
				className={cn(
					"pointer-events-auto absolute right-0 w-1 rounded-full bg-[var(--terminal-scrollbar-thumb)] outline-none transition-[background-color,width] hover:w-2 hover:bg-[var(--terminal-scrollbar-thumb-hover)] focus-visible:w-2 active:bg-[var(--terminal-scrollbar-thumb-hover)] group-hover/terminal-overlay-scrollbar:w-2",
					isDragging && "w-2",
				)}
				style={{
					height: `${metrics.thumbHeightPercent}%`,
					top: `${metrics.thumbTopPercent}%`,
				}}
				onKeyDown={(event) => {
					if (!terminal) return;
					if (event.key === "ArrowUp") {
						event.preventDefault();
						terminal.scrollLines(-1);
					} else if (event.key === "ArrowDown") {
						event.preventDefault();
						terminal.scrollLines(1);
					} else if (event.key === "PageUp") {
						event.preventDefault();
						terminal.scrollPages(-1);
					} else if (event.key === "PageDown") {
						event.preventDefault();
						terminal.scrollPages(1);
					} else if (event.key === "Home") {
						event.preventDefault();
						terminal.scrollToTop();
					} else if (event.key === "End") {
						event.preventDefault();
						terminal.scrollToBottom();
					}
				}}
				onPointerDown={(event) => {
					event.preventDefault();
					event.stopPropagation();
					event.currentTarget.setPointerCapture(event.pointerId);
					const thumbRect = event.currentTarget.getBoundingClientRect();
					dragOffsetRef.current = event.clientY - thumbRect.top;
					setIsDragging(true);
				}}
				onPointerMove={(event) => {
					if (!isDragging) return;
					event.preventDefault();
					scrollToPointer(event.clientY, dragOffsetRef.current);
				}}
				onPointerUp={(event) => {
					if (!isDragging) return;
					event.preventDefault();
					if (event.currentTarget.hasPointerCapture(event.pointerId)) {
						event.currentTarget.releasePointerCapture(event.pointerId);
					}
					setIsDragging(false);
				}}
				onPointerCancel={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) {
						event.currentTarget.releasePointerCapture(event.pointerId);
					}
					setIsDragging(false);
				}}
			/>
		</div>
	);
}
