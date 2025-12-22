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
	const id = useId();
	const canvasId = `gradient-canvas-${id.replace(/:/g, "")}`;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let gradient: GradientInstance | null = null;

		const initGradient = async () => {
			const { Gradient } = await import("stripe-gradient");
			gradient = new Gradient() as GradientInstance;
			gradient.initGradient(`#${canvasId}`);

			setTimeout(() => {
				if (gradient?.uniforms?.u_global?.value?.noiseSpeed) {
					gradient.uniforms.u_global.value.noiseSpeed.value = speed;
				}
			}, 100);
		};

		initGradient();

		return () => {
			if (gradient) {
				if (gradient.pause) {
					gradient.pause();
				}
				if (gradient.conf) {
					gradient.conf.playing = false;
				}
				const dummy = document.createElement("div");
				dummy.appendChild(document.createElement("div"));
				gradient.el = dummy;
				if (gradient.disconnect) {
					gradient.disconnect();
				}
			}
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
