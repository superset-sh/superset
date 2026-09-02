import { tierRgb } from "@/app/[lang]/components/TierBadge";
import { TierIcon } from "@/app/[lang]/components/TierIcon";
import type { ProductionTier } from "../../constants";

interface TierCardProps {
	tier: ProductionTier;
}

export function TierCard({ tier }: TierCardProps) {
	const rgb = tierRgb(tier.tier);

	return (
		<article
			id={`tier-${tier.tier}`}
			className="relative scroll-mt-24 border border-border p-6 md:p-8"
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<span style={{ color: `rgb(${rgb})` }}>
					<TierIcon tier={tier.tier} size={13} />
				</span>
				<h3 className="text-xl md:text-2xl font-medium tracking-tight text-foreground">
					{tier.name}
				</h3>
				<span className="text-xs font-mono text-muted-foreground">
					your attention is on {tier.unit}
				</span>
			</div>

			<p
				className="text-lg md:text-xl leading-snug tracking-tight mt-4"
				style={{ color: `rgb(${rgb})` }}
			>
				{tier.tell}
			</p>

			<p className="text-muted-foreground mt-3 leading-relaxed">
				{tier.description}
			</p>

			<div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 font-mono text-xs">
				{tier.gates.map((gate) => (
					<span key={gate.axis} className="whitespace-nowrap">
						<span className="text-muted-foreground/70 uppercase tracking-wider">
							{gate.axis}
						</span>{" "}
						<span className="text-foreground">{gate.value}</span>
					</span>
				))}
				<span className="text-muted-foreground/60 whitespace-nowrap">
					{tier.medianEta}
				</span>
			</div>
		</article>
	);
}
