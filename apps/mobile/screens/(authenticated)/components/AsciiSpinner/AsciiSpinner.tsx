import { useEffect, useState } from "react";
import { Text } from "@/components/ui/text";

// Braille frames, same as desktop's AsciiSpinner.
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;

/** Replaces a workspace's icon while an agent is working. */
export function AsciiSpinner() {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrameIndex((previous) => (previous + 1) % SPINNER_FRAMES.length);
		}, FRAME_INTERVAL_MS);
		return () => clearInterval(interval);
	}, []);

	return (
		<Text className="text-amber-500 font-mono text-base">
			{SPINNER_FRAMES[frameIndex]}
		</Text>
	);
}
