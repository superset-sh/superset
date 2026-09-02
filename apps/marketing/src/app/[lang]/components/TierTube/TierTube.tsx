import { Trans, useLingui } from "@lingui/react/macro";
import { TIER_NAMES, TIER_RGB } from "@/app/[lang]/components/TierBadge";
import { TierIcon } from "@/app/[lang]/components/TierIcon";

const ZONES = TIER_RGB.map((rgb, index) => ({ tier: index + 1, rgb }));

const railLeft = (position: number) =>
	position <= 0 ? 0 : ((position - 0.5) / ZONES.length) * 100;

const MONTHS_PER_TIER = 7;

function forecastLabel(tier: number, position: number): string | null {
	if (position <= 0) return null;
	if (tier <= Math.floor(position)) return null;

	const months = Math.max(1, Math.round((tier - position) * MONTHS_PER_TIER));
	const when = new Date();
	when.setUTCDate(1);
	when.setUTCMonth(when.getUTCMonth() + months);
	return when.toLocaleDateString("en-US", {
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

function PaceTooltip({
	reached,
	forecast,
	rgb,
	className,
}: {
	reached: boolean;
	forecast: string | null;
	rgb: string;
	className: string;
}) {
	return (
		<div
			className={`pointer-events-none absolute bottom-full z-20 mb-1 opacity-0 transition-opacity group-hover:opacity-100 ${className}`}
		>
			<div className="border border-border bg-background px-3 py-2 text-center">
				<div className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground/70">
					{reached ? (
						<Trans id="marketing.tiers.tube.reached">Reached</Trans>
					) : (
						<Trans id="marketing.tiers.tube.onThisPace">On this pace</Trans>
					)}
				</div>
				<div
					className="font-mono text-[0.72rem] mt-1"
					style={{ color: `rgb(${rgb})` }}
				>
					{reached ? (
						<Trans id="marketing.tiers.tube.now">Now</Trans>
					) : (
						(forecast ?? "—")
					)}
				</div>
			</div>
		</div>
	);
}

interface TierTubeProps {
	position: number;
	counts?: number[];
	subject?: "fleet" | "you";
	pixelClassName?: string;
}

export function TierTube({
	position,
	counts,
	subject = "you",
	pixelClassName = "",
}: TierTubeProps) {
	const { t } = useLingui();
	const activeTier = Math.min(4, Math.max(0, Math.floor(position)));
	const active = ZONES.find((zone) => zone.tier === activeTier);
	const travelled = railLeft(position);
	const isFleet = subject === "fleet";
	const showPace = isFleet && position > 0;

	return (
		<div className="border border-border">
			<div className="relative h-12">
				<div className="absolute inset-0 overflow-hidden">
					<div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-foreground/[0.07]" />

					{active && (
						<div
							className="absolute left-0 top-1/2 h-[3px] origin-left -translate-y-1/2 animate-rail-extend"
							style={{ width: `${travelled}%` }}
						>
							<div
								className="h-full w-full animate-belt-march"
								style={{
									backgroundColor: `rgba(${active.rgb},0.5)`,
									backgroundImage: `repeating-linear-gradient(115deg, rgba(${active.rgb},0.95) 0 4px, transparent 4px 17px)`,
								}}
							/>
						</div>
					)}
				</div>

				{ZONES.map(({ tier, rgb }) => {
					const reached = tier <= activeTier;
					const isActive = tier === activeTier;
					return (
						<div
							key={tier}
							className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-2"
							style={{ left: `${railLeft(tier)}%` }}
						>
							{showPace && (
								<PaceTooltip
									reached={reached}
									forecast={forecastLabel(tier, position)}
									rgb={rgb}
									className="left-1/2 -translate-x-1/2 whitespace-nowrap"
								/>
							)}
							{/* Square, not a dot — it sits better next to the pixel face. */}
							<div
								className={`size-2.5 border ${
									isActive ? "animate-station-pulse" : ""
								}`}
								style={{
									borderColor: reached ? `rgb(${rgb})` : `rgba(${rgb},0.4)`,
									background: reached ? `rgb(${rgb})` : "transparent",
									boxShadow: isActive
										? `0 0 0 4px rgba(${rgb},0.16)`
										: undefined,
								}}
							/>
						</div>
					);
				})}
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border-t border-border">
				{ZONES.map(({ tier, rgb }) => {
					const reached = tier <= activeTier;
					const isActive = tier === activeTier;
					const tierName = TIER_NAMES[tier - 1];
					const value = isFleet
						? counts
							? String(counts[tier] ?? 0)
							: "—"
						: isActive
							? t({ id: "marketing.tiers.tube.you", message: "YOU" })
							: "—";
					return (
						<div
							key={tier}
							className="group relative bg-background px-4 py-3.5"
						>
							{showPace && (
								<PaceTooltip
									reached={reached}
									forecast={forecastLabel(tier, position)}
									rgb={rgb}
									className="inset-x-2"
								/>
							)}
							<div
								className="flex items-center gap-3"
								style={{
									color: reached ? `rgb(${rgb})` : `rgba(${rgb},0.38)`,
								}}
							>
								<TierIcon tier={tier} size={27} />
								<span
									className={`text-xl leading-none ${
										pixelClassName || "font-mono tracking-tight"
									}`}
								>
									{value}
								</span>
							</div>
							<div className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground mt-2">
								{tierName ? t(tierName) : null}
							</div>
							{isFleet && counts && isActive && (
								<div className="text-[0.65rem] text-muted-foreground/70 mt-1">
									<Trans id="marketing.tiers.tube.mostDevelopers">
										most developers
									</Trans>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
