import { Trans } from "@lingui/react/macro";
import {
	CATALOG_BY_SLUG,
	highestPerSlug,
} from "@superset/trpc/leaderboard-achievements";
import { AchievementMedal } from "@/app/[lang]/components/AchievementMedal";
import { MilestoneChip } from "@/app/[lang]/components/MilestoneChip";

interface Award {
	slug: string;
	tier: number;
	awardedOn: string;
}

interface AchievementShelfProps {
	awards: readonly Award[];
}

export function AchievementShelf({ awards }: AchievementShelfProps) {
	const held = highestPerSlug(awards);
	const badges = held.filter(
		(award) => CATALOG_BY_SLUG[award.slug]?.kind === "badge",
	);
	const milestones = held.filter(
		(award) => CATALOG_BY_SLUG[award.slug]?.kind === "milestone",
	);

	if (badges.length === 0 && milestones.length === 0) return null;

	return (
		<section>
			<h2 className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground mb-3">
				<Trans>Achievements</Trans>
			</h2>

			{badges.length > 0 && (
				<div className="flex flex-wrap gap-2.5">
					{badges.map((award) => (
						<AchievementMedal
							key={award.slug}
							slug={award.slug}
							tier={award.tier}
							awardedOn={award.awardedOn}
						/>
					))}
				</div>
			)}

			{milestones.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mt-4">
					{milestones.map((award) => (
						<MilestoneChip
							key={award.slug}
							slug={award.slug}
							tier={award.tier}
						/>
					))}
				</div>
			)}
		</section>
	);
}
