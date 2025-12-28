import type { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAutocompleteStore } from "../stores/autocomplete-store";

interface GhostTextProps {
	xterm: XTerm | null;
	isVisible: boolean;
}

/**
 * Determine if a color is "light" based on luminance.
 * Returns true if the color is light (should use dark ghost text).
 */
function isLightColor(color: string | undefined): boolean {
	if (!color) return false;

	// Parse hex color
	let r = 0;
	let g = 0;
	let b = 0;

	if (color.startsWith("#")) {
		const hex = color.slice(1);
		if (hex.length === 3) {
			r = Number.parseInt(hex[0] + hex[0], 16);
			g = Number.parseInt(hex[1] + hex[1], 16);
			b = Number.parseInt(hex[2] + hex[2], 16);
		} else if (hex.length === 6) {
			r = Number.parseInt(hex.slice(0, 2), 16);
			g = Number.parseInt(hex.slice(2, 4), 16);
			b = Number.parseInt(hex.slice(4, 6), 16);
		}
	} else if (color.startsWith("rgb")) {
		const match = color.match(/\d+/g);
		if (match && match.length >= 3) {
			r = Number.parseInt(match[0], 10);
			g = Number.parseInt(match[1], 10);
			b = Number.parseInt(match[2], 10);
		}
	}

	// Calculate relative luminance
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5;
}

/**
 * GhostText displays a faded inline suggestion after the cursor.
 * The suggestion shows the remaining text (suffix) that would complete the command.
 *
 * User can accept with Right Arrow key.
 */
export function GhostText({ xterm, isVisible }: GhostTextProps) {
	const [position, setPosition] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [cellDimensions, setCellDimensions] = useState({
		width: 9,
		height: 17,
	});
	const rafRef = useRef<number | null>(null);

	const suggestion = useAutocompleteStore((s) => s.suggestion);
	const commandBuffer = useAutocompleteStore((s) => s.commandBuffer);

	// Determine ghost text color based on terminal background
	const ghostColor = useMemo(() => {
		const bgColor = xterm?.options?.theme?.background;
		if (isLightColor(bgColor)) {
			// Light background: use dark ghost text
			return "rgba(0, 0, 0, 0.4)";
		}
		// Dark background: use light ghost text
		return "rgba(255, 255, 255, 0.35)";
	}, [xterm?.options?.theme?.background]);

	// Calculate the suffix to display (what's after what user typed)
	const suggestionSuffix =
		suggestion && commandBuffer && suggestion.startsWith(commandBuffer)
			? suggestion.slice(commandBuffer.length)
			: null;

	// Update position continuously while visible
	useEffect(() => {
		if (!xterm || !isVisible || !suggestionSuffix) {
			// Only update state if needed to prevent unnecessary re-renders
			setPosition((prev) => (prev === null ? prev : null));
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			return;
		}

		const updatePosition = () => {
			try {
				const container = xterm.element;
				if (!container) return;

				// Get cell dimensions from xterm's internal renderer
				// @ts-expect-error - accessing internal property
				const dims = xterm._core?._renderService?.dimensions;
				const cellWidth = dims?.css?.cell?.width ?? 9;
				const cellHeight = dims?.css?.cell?.height ?? 17;

				setCellDimensions({ width: cellWidth, height: cellHeight });

				// Get cursor position
				const cursorX = xterm.buffer.active.cursorX;
				const cursorY = xterm.buffer.active.cursorY;

				// Calculate pixel position - account for any viewport offset
				const x = cursorX * cellWidth;
				// The y position needs to align with the text baseline
				const y = cursorY * cellHeight;

				setPosition({ x, y });
			} catch {
				setPosition(null);
			}

			// Keep updating while visible
			rafRef.current = requestAnimationFrame(updatePosition);
		};

		updatePosition();

		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [xterm, isVisible, suggestionSuffix]);

	if (!isVisible || !suggestionSuffix || !position) {
		return null;
	}

	// Get the actual font settings from xterm options
	const fontSize = xterm?.options?.fontSize ?? 14;
	const fontFamily = xterm?.options?.fontFamily ?? "monospace";

	return (
		<div
			className="pointer-events-none absolute z-10"
			style={{
				left: position.x,
				top: position.y,
				height: cellDimensions.height,
				display: "flex",
				alignItems: "center",
			}}
		>
			<span
				className="whitespace-pre transition-opacity duration-75"
				style={{
					fontFamily,
					fontSize: `${fontSize}px`,
					lineHeight: `${cellDimensions.height}px`,
					color: ghostColor,
				}}
			>
				{suggestionSuffix}
			</span>
		</div>
	);
}
