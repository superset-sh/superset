"use client";

import { useEffect, useId, useRef } from "react";
import { Gradient } from "stripe-gradient";

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

function supportsWebgl(): boolean {
	try {
		const probe = document.createElement("canvas");
		return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
	} catch {
		return false;
	}
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
		if (!canvas || !supportsWebgl()) return;

		const gradient = new Gradient() as GradientInstance;

		const teardown = () => {
			if (gradient.pause) {
				gradient.pause();
			}
			if (gradient.conf) {
				gradient.conf.playing = false;
			}
			// stripe-gradient's delayed init reads both el.parentElement and el
			// children after we unmount, so the decoy needs a parent AND a child.
			const dummy = document.createElement("div");
			dummy.appendChild(document.createElement("div"));
			document.createElement("div").appendChild(dummy);
			gradient.el = dummy;
			if (gradient.disconnect) {
				gradient.disconnect();
			}
		};

		// Guard scoped to init only: the library dereferences a null WebGL
		// context when creation fails despite the probe above.
		try {
			gradient.initGradient(`#${canvasId}`);
		} catch {
			teardown();
			return;
		}

		setTimeout(() => {
			if (gradient?.uniforms?.u_global?.value?.noiseSpeed) {
				gradient.uniforms.u_global.value.noiseSpeed.value = speed;
			}
		}, 100);

		return teardown;
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
