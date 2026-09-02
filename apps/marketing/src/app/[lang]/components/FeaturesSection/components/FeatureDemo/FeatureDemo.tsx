import type { ReactNode } from "react";

interface FeatureDemoProps {
	children: ReactNode;
	className?: string;
}

export function FeatureDemo({ children, className = "" }: FeatureDemoProps) {
	return (
		<div
			className={`relative w-full min-h-[300px] lg:aspect-4/3 overflow-hidden max-sm:[mask-image:linear-gradient(to_right,black_82%,transparent)] ${className}`}
		>
			{/* Soft ember glow behind the demo window, same stage lighting as the hero */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse 55% 45% at 50% 40%, rgba(232,128,74,0.05), transparent 75%)",
				}}
			/>
			<div className="relative z-10 flex h-full w-full items-center justify-start p-4 sm:justify-center sm:p-6">
				{children}
			</div>
		</div>
	);
}
