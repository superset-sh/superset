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
			className={`relative w-full aspect-4/3 rounded-2xl overflow-hidden ${className}`}
		>
			{/* Background gradient */}
			<MeshGradient
				colors={colors}
				className="absolute inset-0 w-full h-full"
			/>

			{/* Content overlay */}
			<div className="relative z-10 w-full h-full flex items-center justify-center p-6">
				{children}
			</div>
		</div>
	);
}
