import { Trans } from "@lingui/react/macro";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";

export function PricingHero() {
	return (
		<header className="relative border-b border-border">
			<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
				<GridCross className="top-0 left-0" />
				<GridCross className="top-0 right-0" />

				<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
					<Trans id="marketing.pricing.hero.eyebrow">Pricing</Trans>
				</span>
				<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
					<Trans id="marketing.pricing.hero.title">
						Simple pricing for every team
					</Trans>
				</h1>
				<p className="text-muted-foreground mt-3 max-w-lg">
					<Trans id="marketing.pricing.hero.subtitle">
						Start free. Upgrade when your team outgrows it. Enterprise plans for
						organizations with advanced security and compliance needs.
					</Trans>
				</p>

				<GridCross className="bottom-0 left-0" />
				<GridCross className="bottom-0 right-0" />
			</div>
		</header>
	);
}
