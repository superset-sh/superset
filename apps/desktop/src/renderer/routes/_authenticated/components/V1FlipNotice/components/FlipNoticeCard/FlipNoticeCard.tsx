import { Button } from "@superset/ui/button";
import { X } from "lucide-react";
import { lazy, Suspense } from "react";

const Dithering = lazy(() =>
	import("@paper-design/shaders-react").then((mod) => ({
		default: mod.Dithering,
	})),
);

/** Same warm ramp as the import wizard's WelcomePage — one visual family. */
const COVER_FRONT = "#f97316";

interface FlipNoticeCardProps {
	title: string;
	body: string;
	ctaLabel: string;
	onDismiss: () => void;
}

/**
 * Shared shell for the pre-flip notice and post-flip welcome: the import
 * wizard's dithered-cover identity (WelcomePage) compressed into a
 * corner card. Sharp corners and a cover headline read as a milestone
 * message, not a transient toast.
 */
export function FlipNoticeCard({
	title,
	body,
	ctaLabel,
	onDismiss,
}: FlipNoticeCardProps) {
	return (
		<div className="fixed right-4 bottom-4 z-50 w-[380px] select-text overflow-hidden rounded-none border bg-background shadow-2xl">
			<div className="relative h-20 bg-[#080a12]">
				<div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-screen">
					<Suspense fallback={null}>
						<Dithering
							colorBack="#00000000"
							colorFront={COVER_FRONT}
							shape="warp"
							type="4x4"
							speed={0.15}
							className="size-full"
							minPixelRatio={1}
						/>
					</Suspense>
				</div>
				<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.14),transparent_34%),linear-gradient(to_bottom,rgba(0,0,0,0.04),rgba(0,0,0,0.5))]" />
				<div className="absolute inset-0 flex items-center px-4">
					<p className="font-semibold text-base text-white">{title}</p>
				</div>
				<button
					type="button"
					aria-label="Dismiss"
					className="absolute top-3 right-3 rounded-none p-1 text-white/70 hover:text-white"
					onClick={onDismiss}
				>
					<X className="size-4" />
				</button>
			</div>
			<div className="space-y-3 p-4 pt-3">
				<p className="text-muted-foreground text-sm">{body}</p>
				<Button size="sm" onClick={onDismiss}>
					{ctaLabel}
				</Button>
			</div>
		</div>
	);
}
