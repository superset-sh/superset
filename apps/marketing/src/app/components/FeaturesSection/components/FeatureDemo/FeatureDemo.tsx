import type { ReactNode } from "react";
import { DitheredBackground } from "./components/DitheredBackground";

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
			className={`relative w-full min-h-[300px] lg:aspect-4/3 overflow-hidden ${className}`}
		>
			{/* Background gradient */}
			<DitheredBackground
				colors={colors}
				className="absolute inset-0 w-full h-full"
			/>

			{/* Content overlay */}
			<div className="relative z-10 w-full h-full flex items-center justify-start sm:justify-center p-4 sm:p-6">
				{children}
			</div>
		</div>
	);
}
