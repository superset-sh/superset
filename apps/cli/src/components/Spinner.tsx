import { Text } from "ink";
import React from "react";

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_INTERVAL = 80;

interface SpinnerProps {
	color?: string;
	interval?: number;
	frames?: string[];
	text?: string;
}

/**
 * Hook that returns the current spinner frame.
 * Useful when you need the raw frame value for composing with other text.
 */
export function useSpinner(
	frames: string[] = DEFAULT_FRAMES,
	interval: number = DEFAULT_INTERVAL,
): string {
	const [index, setIndex] = React.useState(0);

	React.useEffect(() => {
		if (frames.length === 0) {
			return;
		}

		const timer = setInterval(() => {
			setIndex((i) => (i + 1) % frames.length);
		}, interval);

		return () => clearInterval(timer);
	}, [frames.length, interval]);

	return frames[index] || "";
}

/**
 * Lightweight Ink-friendly spinner component.
 * @example
 * <Spinner color="green" />
 * <Spinner color="yellow" interval={100} frames={["◐", "◓", "◑", "◒"]} />
 */
export function Spinner({
	color,
	interval = DEFAULT_INTERVAL,
	frames = DEFAULT_FRAMES,
	text,
}: SpinnerProps) {
	const frame = useSpinner(frames, interval);

	if (frames.length === 0) {
		return null;
	}

	return (
		<Text color={color}>
			{frame}
			{text ? ` ${text}` : ""}
		</Text>
	);
}
