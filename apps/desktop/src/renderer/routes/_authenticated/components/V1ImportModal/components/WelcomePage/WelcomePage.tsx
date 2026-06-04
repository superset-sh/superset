import { cn } from "@superset/ui/utils";
import { lazy, Suspense } from "react";

const Dithering = lazy(() =>
	import("@paper-design/shaders-react").then((mod) => ({
		default: mod.Dithering,
	})),
);

const GRADIENT_COLORS = [
	"#f97316",
	"#fb923c",
	"#f59e0b",
	"#431407",
] as const satisfies readonly [string, string, string, string];

export function WelcomePage() {
	return (
		<div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#080a12]">
			<DitheredBackground
				colors={GRADIENT_COLORS}
				className="absolute inset-0 h-full w-full"
			/>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.14),transparent_34%),linear-gradient(to_bottom,rgba(0,0,0,0.04),rgba(0,0,0,0.5))]" />
			<div className="absolute inset-0 flex flex-col items-center justify-center px-14 text-center">
				<div className="text-3xl font-semibold text-white">
					Welcome to Superset v2
				</div>
			</div>
		</div>
	);
}

interface DitheredBackgroundProps {
	colors: readonly [string, string, string, string];
	className?: string;
}

function DitheredBackground({
	colors,
	className = "",
}: DitheredBackgroundProps) {
	return (
		<div
			className={cn(
				"pointer-events-none opacity-40 mix-blend-screen",
				className,
			)}
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
