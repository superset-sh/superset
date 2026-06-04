"use client";

import { useEffect, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface AsciiSpinnerProps {
	className?: string;
	toneClassName?: string;
}

export function AsciiSpinner({
	className,
	toneClassName = "text-orange-500/80",
}: AsciiSpinnerProps) {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
		}, 80);

		return () => clearInterval(interval);
	}, []);

	return (
		<span className={`select-none font-mono ${toneClassName} ${className}`}>
			{SPINNER_FRAMES[frameIndex]}
		</span>
	);
}
