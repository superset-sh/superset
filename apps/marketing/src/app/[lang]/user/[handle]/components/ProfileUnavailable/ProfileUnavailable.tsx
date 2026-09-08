import { Trans } from "@lingui/react/macro";
import Link from "next/link";
import { FactoryBackdrop } from "@/app/[lang]/components/FactoryBackdrop";

export function ProfileUnavailable() {
	return (
		<main className="relative min-h-screen">
			<FactoryBackdrop halfWidth={384} glow={false} grid={false} />

			<div className="relative max-w-3xl mx-auto px-6 py-24 text-center">
				<h1 className="text-2xl md:text-3xl font-medium text-foreground">
					<Trans>This profile is busy right now</Trans>
				</h1>
				<p className="text-sm text-muted-foreground leading-relaxed mt-4">
					<Trans>Too many people are looking at once. Try again shortly.</Trans>
				</p>
				<Link
					href="/leaderboard"
					className="inline-flex items-center mt-8 px-4 py-2.5 text-sm border border-border text-foreground hover:bg-muted transition-colors"
				>
					<Trans>Back to the leaderboard</Trans>
				</Link>
			</div>
		</main>
	);
}
