"use client";

import type { RefObject } from "react";

export type DictationBarProps = {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	seconds: number;
};

function formatElapsed(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DictationBar({ canvasRef, seconds }: DictationBarProps) {
	return (
		<div className="flex min-w-0 flex-1 items-center gap-3">
			<canvas
				ref={canvasRef}
				className="h-7 min-w-0 flex-1 text-muted-foreground"
			/>
			<span className="shrink-0 text-sm text-muted-foreground tabular-nums">
				{formatElapsed(seconds)}
			</span>
		</div>
	);
}
