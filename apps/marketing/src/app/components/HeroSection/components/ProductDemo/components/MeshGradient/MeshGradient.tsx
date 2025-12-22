"use client";

import { useEffect, useId, useRef } from "react";

interface MeshGradientProps {
	colors: readonly [string, string, string, string];
	className?: string;
	speed?: number;
}

interface GradientInstance {
	initGradient: (selector: string) => void;
	disconnect?: () => void;
	pause?: () => void;
	el?: HTMLElement | null;
	conf?: { playing?: boolean };
	uniforms?: {
		u_global?: {
			value?: {
				noiseSpeed?: {
					value: number;
				};
			};
		};
	};
}

export function MeshGradient({
	colors,
	className = "",
	speed = 3e-6,
}: MeshGradientProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const gradientRef = useRef<GradientInstance | null>(null);
	const id = useId();
	const canvasId = `gradient-canvas-${id.replace(/:/g, "")}`;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let gradient: GradientInstance | null = null;

		const initGradient = async () => {
			try {
				const { Gradient } = await import("stripe-gradient");
				gradient = new Gradient() as GradientInstance;
				gradient.initGradient(`#${canvasId}`);

				// Slow down the animation speed (default is 5e-6)
				setTimeout(() => {
					if (gradient?.uniforms?.u_global?.value?.noiseSpeed) {
						gradient.uniforms.u_global.value.noiseSpeed.value = speed;
					}
				}, 100);

				gradientRef.current = gradient;
			} catch (error) {
				console.error("Failed to initialize gradient:", error);
			}
		};

		initGradient();

		return () => {
			if (gradient) {
				// Stop animation
				if (gradient.pause) {
					gradient.pause();
				}
				if (gradient.conf) {
					gradient.conf.playing = false;
				}
				// Replace element with dummy to prevent classList errors in setTimeout callbacks
				const dummy = document.createElement("div");
				dummy.appendChild(document.createElement("div"));
				gradient.el = dummy;
				if (gradient.disconnect) {
					gradient.disconnect();
				}
			}
			gradientRef.current = null;
		};
	}, [canvasId, speed]);

	return (
		<div className={className}>
			<canvas
				ref={canvasRef}
				id={canvasId}
				className="w-full h-full"
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
		</div>
	);
}
