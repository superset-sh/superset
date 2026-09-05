"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { CATALOG_BY_SLUG } from "@superset/trpc/leaderboard-achievements";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { PixelIcon } from "@/app/[lang]/components/PixelIcon";
import { ACHIEVEMENT_COPY } from "@/app/[lang]/utils/achievementCopy";
import { thresholdLabel } from "@/app/[lang]/utils/thresholdLabel";

interface AchievementMedalProps {
	slug: string;
	tier: number;
	awardedOn: string;
}

export function AchievementMedal({
	slug,
	tier,
	awardedOn,
}: AchievementMedalProps) {
	const { t } = useLingui();
	const def = CATALOG_BY_SLUG[slug];
	const copy = ACHIEVEMENT_COPY[slug];
	if (!def?.art || !copy) return null;

	const threshold = def.thresholds[Math.max(0, tier - 1)];
	const tiered = def.thresholds.length > 1;
	const name = t(copy.name);

	return (
		<HoverCard openDelay={100} closeDelay={60}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={name}
					className="relative flex size-11 shrink-0 items-center justify-center border border-border bg-foreground/[0.03] text-foreground/70 transition-colors hover:text-foreground hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
				>
					<PixelIcon art={def.art} size={24} />
					{tiered && tier > 1 && (
						<span className="absolute -bottom-1.5 -right-1.5 px-1 font-mono text-[0.55rem] leading-[1.15] border border-border bg-background text-muted-foreground">
							{`×${tier}`}
						</span>
					)}
				</button>
			</HoverCardTrigger>

			<HoverCardContent align="start" className="w-60">
				<div className="flex items-baseline gap-1.5">
					<span className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-foreground">
						{name}
					</span>
					{tiered && tier > 1 && (
						<span className="font-mono text-[0.6rem] text-brand">
							{`×${tier}`}
						</span>
					)}
				</div>

				<p className="font-mono text-[0.62rem] uppercase tracking-[0.09em] text-muted-foreground mt-1.5 leading-relaxed">
					{threshold === undefined ? (
						t(copy.detail)
					) : slug === "ship-it" ? (
						<Plural
							value={threshold}
							one="# agent PR merged"
							other="# agent PRs merged"
						/>
					) : (
						`${thresholdLabel(slug, threshold)} ${t(copy.detail)}`
					)}
				</p>

				<p className="font-mono text-[0.56rem] uppercase tracking-[0.09em] text-muted-foreground/60 mt-2.5 border-t border-border pt-2">
					<Trans>
						Earned{" "}
						{formatDate(new Date(`${awardedOn}T00:00:00Z`), {
							day: "numeric",
							month: "short",
							year: "numeric",
							timeZone: "UTC",
						})}
					</Trans>
				</p>
			</HoverCardContent>
		</HoverCard>
	);
}
