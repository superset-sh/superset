export const MAX_FOOTER_TIER = 3;
export const FOOTER_TIER_PROMOTION_SLACK_PX = 32;

export type FooterTierStep = {
	tier: number;
	/** Index i holds the row width at which tier i last overflowed. */
	demotionWidths: ReadonlyArray<number | undefined>;
};

export function nextFooterTier({
	currentTier,
	width,
	overflowing,
	demotionWidths,
}: {
	currentTier: number;
	width: number;
	overflowing: boolean;
	demotionWidths: ReadonlyArray<number | undefined>;
}): FooterTierStep {
	const widths = [...demotionWidths];
	let tier = Math.max(0, Math.min(currentTier, MAX_FOOTER_TIER));
	while (tier > 0) {
		const overflowedAt = widths[tier - 1];
		if (
			overflowedAt !== undefined &&
			width < overflowedAt + FOOTER_TIER_PROMOTION_SLACK_PX
		)
			break;
		tier -= 1;
	}
	if (overflowing && tier < MAX_FOOTER_TIER) {
		widths[tier] = width;
		tier += 1;
	}
	return { tier, demotionWidths: widths };
}
