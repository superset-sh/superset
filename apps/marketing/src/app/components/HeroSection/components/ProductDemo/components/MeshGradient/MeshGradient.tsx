"use client";

import { useEffect, useId, useRef } from "react";

interface MeshGradientProps {
	colors: readonly [string, string, string, string];
	className?: string;
}

export function MeshGradient({ colors, className = "" }: MeshGradientProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const gradientRef = useRef<unknown>(null);
	const id = useId();
	const canvasId = `gradient-canvas-${id.replace(/:/g, "")}`;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let gradient: { disconnect?: () => void } | null = null;

		const initGradient = async () => {
			try {
				const { Gradient } = await import("stripe-gradient");
				gradient = new Gradient();
				(gradient as { initGradient: (selector: string) => void }).initGradient(
					`#${canvasId}`,
				);
				gradientRef.current = gradient;
			} catch (error) {
				console.error("Failed to initialize gradient:", error);
			}
		};

		initGradient();

		return () => {
			if (gradient && typeof gradient.disconnect === "function") {
				gradient.disconnect();
			}
			gradientRef.current = null;
		};
	}, [canvasId]);

	return (
		<canvas
			ref={canvasRef}
			id={canvasId}
			className={className}
			data-transition-in
			style={
				{
					"--gradient-color-1": colors[0],
					"--gradient-color-2": colors[1],
					"--gradient-color-3": colors[2],
					"--gradient-color-4": colors[3],
				} as React.CSSProperties
			}
		/>
	);
}
