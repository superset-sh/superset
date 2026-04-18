"use client";

import { lazy, Suspense } from "react";

const Dithering = lazy(() =>
	import("@paper-design/shaders-react").then((mod) => ({
		default: mod.Dithering,
	})),
);

interface DitheredBackgroundProps {
	colors: readonly [string, string, string, string];
	className?: string;
}

export function DitheredBackground({
	colors,
	className = "",
}: DitheredBackgroundProps) {
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
