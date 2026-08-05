"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const Dithering = lazy(() =>
	import("@paper-design/shaders-react").then((mod) => ({
		default: mod.Dithering,
	})),
);

let webGlSupport: boolean | null = null;

function supportsWebGl(): boolean {
	if (webGlSupport !== null) return webGlSupport;
	try {
		const canvas = document.createElement("canvas");
		webGlSupport = Boolean(
			canvas.getContext("webgl2") ?? canvas.getContext("webgl"),
		);
	} catch {
		webGlSupport = false;
	}
	return webGlSupport;
}

interface DitheredBackgroundProps {
	colors: readonly [string, string, string, string];
	className?: string;
}

export function DitheredBackground({
	colors,
	className = "",
}: DitheredBackgroundProps) {
	const [renderShader, setRenderShader] = useState(false);
	useEffect(() => {
		if (supportsWebGl()) setRenderShader(true);
	}, []);

	if (!renderShader) return null;

	return (
		<div
			className={`${className} pointer-events-none opacity-30 mix-blend-screen`}
		>
			<Suspense fallback={null}>
				<Dithering
					colorBack="#00000000"
					colorFront={colors[0]}
					shape="warp"
					type="4x4"
					speed={0.15}
					className="size-full"
					minPixelRatio={1}
				/>
			</Suspense>
		</div>
	);
}
