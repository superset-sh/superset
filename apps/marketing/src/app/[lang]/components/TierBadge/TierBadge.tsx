import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { TierIcon } from "@/app/[lang]/components/TierIcon";

export const TIER_NAMES: readonly MessageDescriptor[] = [
	msg({ id: "marketing.tiers.name.buttonPusher", message: "Button pusher" }),
	msg({ id: "marketing.tiers.name.operator", message: "Operator" }),
	msg({ id: "marketing.tiers.name.plantManager", message: "Plant Manager" }),
	msg({ id: "marketing.tiers.name.henryFord", message: "Henry Ford" }),
];

export const UNRANKED_LABEL: MessageDescriptor = msg({
	id: "marketing.tiers.unranked",
	message: "Unranked",
});

export const TIER_RGB = [
	"147,157,171",
	"91,157,251",
	"49,176,108",
	"219,135,34",
] as const;

const LOCKED_RGB = "255,255,255";

export const tierRgb = (tier: number): string =>
	TIER_RGB[tier - 1] ?? TIER_RGB[1];

export const tierLabel = (tier: number): MessageDescriptor =>
	tier >= 1 && tier <= 4
		? (TIER_NAMES[tier - 1] ?? UNRANKED_LABEL)
		: UNRANKED_LABEL;

interface TierBadgeProps {
	tier: number;

	size?: "sm" | "hero";
	className?: string;
}

export function TierBadge({
	tier,
	size = "sm",
	className = "",
}: TierBadgeProps) {
	const { t } = useLingui();
	const ranked = tier >= 1 && tier <= 4;
	const style = ranked
		? {
				color: `rgb(${tierRgb(tier)})`,
				borderColor: `rgba(${tierRgb(tier)},0.4)`,
			}
		: {
				color: `rgba(${LOCKED_RGB},0.4)`,
				borderColor: `rgba(${LOCKED_RGB},0.14)`,
			};

	if (size === "hero") {
		return (
			<div
				className={`inline-flex flex-col items-center border px-8 py-4 ${className}`}
				style={style}
			>
				<TierIcon tier={tier} size={36} hollow={!ranked} className="mb-3" />
				<span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] opacity-60">
					{ranked
						? t({
								id: "marketing.tiers.factoryTier",
								message: `Factory tier ${tier}`,
							})
						: t(UNRANKED_LABEL)}
				</span>
				<span className="text-2xl md:text-3xl mt-1.5 tracking-tight">
					{t(tierLabel(tier))}
				</span>
			</div>
		);
	}

	return (
		<span
			className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.1em] whitespace-nowrap ${className}`}
			style={style}
		>
			<TierIcon tier={tier} size={9} hollow={!ranked} />
			{t(tierLabel(tier))}
		</span>
	);
}
