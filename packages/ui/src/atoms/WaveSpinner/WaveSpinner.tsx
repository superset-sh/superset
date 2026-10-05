import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

const FRAME_MS = 50;
const FRAMES_PER_LOOP = 24;
const FADE_FRAMES = 3;
const DIAGONAL_DELAY_FRAMES = 2;
const EMPTY_START_FRAME = 11;
const CELLS = Array.from({ length: 9 }, (_, index) => ({
	id: index,
	diagonal: Math.floor(index / 3) + (index % 3),
}));

function ramp(frames: number): number {
	return Math.min(1, Math.max(0, frames / FADE_FRAMES));
}

function cellOpacity(frame: number, diagonal: number): number {
	const delay = diagonal * DIAGONAL_DELAY_FRAMES;
	return ramp(frame - delay) - ramp(frame - EMPTY_START_FRAME - delay);
}

interface WaveSpinnerProps {
	className?: string;
}

export function WaveSpinner({ className }: WaveSpinnerProps) {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrame((current) => (current + 1) % FRAMES_PER_LOOP);
		}, FRAME_MS);
		return () => clearInterval(interval);
	}, []);

	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid size-[11px] shrink-0 grid-cols-[repeat(3,3px)] grid-rows-[repeat(3,3px)] gap-px",
				className,
			)}
		>
			{CELLS.map((cell) => (
				<span
					key={cell.id}
					className="rounded-[0.5px] bg-current"
					style={{ opacity: cellOpacity(frame, cell.diagonal) }}
				/>
			))}
		</span>
	);
}
