import type { ReactNode } from "react";
import { FactoryBackdrop } from "../FactoryBackdrop";

export function LeaderboardLayout({
	children,
	compact = false,
	wide = false,
	fullBleed = false,
}: {
	children: ReactNode;
	compact?: boolean;
	wide?: boolean;
	fullBleed?: boolean;
}) {
	return (
		<main className="relative isolate min-h-screen bg-background">
			<FactoryBackdrop halfWidth={compact ? 384 : wide ? 640 : 512} />
			<div
				className={
					fullBleed
						? "relative"
						: `relative mx-auto px-4 py-8 sm:px-6 md:py-12 ${compact ? "max-w-3xl" : wide ? "max-w-7xl" : "max-w-5xl"}`
				}
			>
				{children}
			</div>
		</main>
	);
}
