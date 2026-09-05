import { useLingui } from "@lingui/react/macro";
import { CATALOG_BY_SLUG } from "@superset/trpc/leaderboard-achievements";
import { ACHIEVEMENT_COPY } from "@/app/[lang]/utils/achievementCopy";
import { thresholdLabel } from "@/app/[lang]/utils/thresholdLabel";

interface MilestoneChipProps {
	slug: string;
	tier: number;
}

export function MilestoneChip({ slug, tier }: MilestoneChipProps) {
	const { t } = useLingui();
	const def = CATALOG_BY_SLUG[slug];
	const copy = ACHIEVEMENT_COPY[slug];
	if (!def || !copy) return null;

	const threshold = def.thresholds[Math.max(0, tier - 1)];
	if (threshold === undefined) return null;

	return (
		<span className="inline-flex items-baseline gap-1.5 border border-border px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground">
			<span className="text-foreground">{thresholdLabel(slug, threshold)}</span>
			{t(copy.name)}
		</span>
	);
}
