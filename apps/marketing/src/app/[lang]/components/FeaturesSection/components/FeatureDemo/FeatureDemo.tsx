import type { ReactNode } from "react";

interface FeatureDemoProps {
	children: ReactNode;
	className?: string;
	fitContent?: boolean;
}

export function FeatureDemo({
	children,
	className = "",
	fitContent = false,
}: FeatureDemoProps) {
	return (
		<div
			className={`relative w-full overflow-hidden ${fitContent ? "" : "min-h-[300px] lg:aspect-4/3 max-sm:[mask-image:linear-gradient(to_right,black_82%,transparent)]"} ${className}`}
		>
			{/* Soft ember glow behind the demo window, same stage lighting as the hero */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse 55% 45% at 50% 40%, rgba(232,128,74,0.05), transparent 75%)",
				}}
			/>
			<div
				className={`relative z-10 flex h-full w-full items-center p-4 sm:justify-center sm:p-6 ${fitContent ? "justify-center" : "justify-start"}`}
			>
				{children}
			</div>
		</div>
	);
}
