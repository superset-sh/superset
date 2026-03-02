import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";

/** Braille-based spinner frames for a smooth animation */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Animation interval in milliseconds */
const FRAME_INTERVAL = 80;

interface AsciiSpinnerProps {
	className?: string;
}

/**
 * ASCII spinner using braille characters.
 * Replaces the folder icon when an agent is working.
 */
export function AsciiSpinner({ className }: AsciiSpinnerProps) {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
		}, FRAME_INTERVAL);

		return () => clearInterval(interval);
	}, []);

	return (
		<span
			className={cn("text-amber-500 font-mono select-none", className)}
			aria-hidden="true"
		>
			{SPINNER_FRAMES[frameIndex]}
		</span>
	);
}
