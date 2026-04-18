"use client";

import { MeshGradient } from "@superset/ui/mesh-gradient";
import type { ReactNode } from "react";

interface FeatureDemoProps {
	children: ReactNode;
	colors: readonly [string, string, string, string];
	className?: string;
}

export function FeatureDemo({
	children,
	colors,
	className = "",
}: FeatureDemoProps) {
	return (
		<div
			className={`relative w-full min-h-[300px] lg:aspect-4/3 overflow-hidden mc-enchant-glow ${className}`}
		>
			{/* Outer 3D bevel frame */}
			<div
				className="absolute inset-0 border-4 pointer-events-none z-10"
				style={{ borderColor: "#8B6542 #2C1A0E #2C1A0E #8B6542" }}
			/>
			{/* Inner bevel */}
			<div
				className="absolute inset-[2px] border-2 pointer-events-none z-10"
				style={{ borderColor: "#6B4D30 #1A0E06 #1A0E06 #6B4D30" }}
			/>

			{/* Background gradient */}
			<MeshGradient
				colors={colors}
				className="absolute inset-0 w-full h-full"
			/>

			{/* Crafting grid overlay */}
			<div className="absolute inset-0 mc-crafting-grid pointer-events-none" />

			{/* Content overlay */}
			<div className="relative z-10 w-full h-full flex items-center justify-start sm:justify-center p-4 sm:p-6">
				{children}
			</div>
		</div>
	);
}
