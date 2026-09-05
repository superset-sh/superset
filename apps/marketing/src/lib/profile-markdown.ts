import { COMPANY } from "@superset/shared/constants";
import {
	type AchievementDef,
	CATALOG_BY_SLUG,
	highestPerSlug,
	isCurrencyAward,
} from "@superset/trpc/leaderboard-achievements";
import {
	type AxisName,
	scoredGaps,
	TIER_NAMES,
	type Tier,
} from "@superset/trpc/leaderboard-tier";
import type { ParticipantProfile } from "@/app/[lang]/utils/fetchLeaderboard";

const cell = (value: string) =>
	value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

const AXIS_MEANING: Record<AxisName, string> = {
	width: "agents running at once",
	depth: "tokens per session",
	output: "agent PRs merged per week",
	sustain: "active days in the last 30",
	cost: "USD per merged PR, lower is better",
};

const tierName = (tier: number) =>
	tier >= 1 && tier <= 4 ? (TIER_NAMES[tier - 1] ?? "Unranked") : "Unranked";

function compact(value: number): string {
	if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return String(Math.round(value));
}

function axisValue(axis: AxisName, value: number): string {
	if (axis === "cost")
		return value > 0 ? `$${value.toFixed(2)}` : "not measured";
	if (axis === "depth") return compact(value);
	if (axis === "sustain") return String(Math.round(value));
	return value.toFixed(1);
}

function achievementLine(
	def: AchievementDef,
	tier: number,
	awardedOn: string,
): string {
	const threshold = def.thresholds[Math.max(0, tier - 1)];
	const level =
		def.thresholds.length > 1
			? ` (level ${tier} of ${def.thresholds.length})`
			: "";
	const reached =
		threshold === undefined
			? ""
			: ` at ${isCurrencyAward(def) ? `$${threshold}` : compact(threshold)}`;
	return `- **${def.slug}**${level}${reached}, earned ${awardedOn}`;
}

export function renderProfileMarkdown(profile: ParticipantProfile): string {
	const tier = profile.factory?.tier ?? 0;
	const gaps = scoredGaps(profile.axes, tier as Tier);
	const next = Math.min(4, tier + 1);

	const yearAgo = new Date(Date.now() - 365 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const activeDays = profile.daily.filter(
		(day) => day.tokens > 0 && day.day >= yearAgo,
	).length;
	const busiest = profile.daily.reduce(
		(best, day) => (day.tokens > best.tokens ? day : best),
		{ day: "—", tokens: 0, usd: "0" },
	);

	const held = highestPerSlug(profile.awards);

	const badges = held.filter(
		(award) => CATALOG_BY_SLUG[award.slug]?.kind === "badge",
	);
	const milestones = held.filter(
		(award) => CATALOG_BY_SLUG[award.slug]?.kind === "milestone",
	);

	const lines: string[] = [
		"## Standing",
		"",
		`- Rank: #${profile.rank} of ${profile.total}`,
		`- Tier: ${tierName(tier)}`,
		`- Tokens: ${compact(profile.allTime.tokens)} all time`,
		`- Cost: $${Number(profile.allTime.usd).toFixed(2)} API-equivalent`,
		`- Sessions: ${profile.allTime.sessions}`,
		...(profile.dayRange
			? [`- Tracking: ${profile.dayRange.from} to ${profile.dayRange.to}`]
			: []),
		"",
	];

	if (profile.bio) {
		lines.push("## Bio", "", `> ${cell(profile.bio)}`, "");
	}

	const links = [
		profile.githubHandle
			? `- GitHub: https://github.com/${profile.githubHandle} (verified via sign-in)`
			: null,
		profile.xHandle ? `- X: https://x.com/${profile.xHandle}` : null,
		profile.websiteUrl ? `- Site: ${profile.websiteUrl}` : null,
	].filter(Boolean) as string[];

	if (links.length > 0) {
		lines.push("## Links", "", ...links, "");
	}

	lines.push(
		"## How this tier was reached",
		"",
		`Tier is a weighted score across the axes measured for you, so a strong axis offsets a weak one. ${tierName(next)} needs a higher combined score, and cost also caps the tier on its own.`,
		`Scored on ${gaps.length} ${gaps.length === 1 ? "axis" : "axes"}, measured over the trailing 30 days.`,
		"",
		"| Axis | Current | Needed | Met | Measures |",
		"| --- | --- | --- | --- | --- |",
		...gaps.map(
			(gap) =>
				`| ${gap.axis} | ${axisValue(gap.axis, gap.current)} | ${
					gap.lowerIsBetter ? "<= " : ""
				}${axisValue(gap.axis, gap.needed)} | ${gap.met ? "yes" : "no"} | ${
					AXIS_MEANING[gap.axis]
				} |`,
		),
		"",
	);

	if (badges.length > 0) {
		lines.push(
			"## Achievements",
			"",
			...badges.map((award) => {
				const def = CATALOG_BY_SLUG[award.slug];
				return def
					? achievementLine(def, award.tier, award.awardedOn)
					: `- ${award.slug}`;
			}),
			"",
		);
	}

	if (milestones.length > 0) {
		lines.push(
			"## Milestones",
			"",
			...milestones.map((award) => {
				const threshold =
					CATALOG_BY_SLUG[award.slug]?.thresholds[Math.max(0, award.tier - 1)];
				return `- ${award.slug}: ${
					threshold === undefined ? "—" : compact(threshold)
				}`;
			}),
			"",
		);
	}

	lines.push(
		"## Contributions",
		"",
		`- Active days in the last year: ${activeDays}`,
		`- Busiest day: ${busiest.day} at ${compact(busiest.tokens)} tokens`,
		"",
		"## Models",
		"",
		"| Provider | Model | Tokens | Cost |",
		"| --- | --- | --- | --- |",
		...profile.models.map(
			(model) =>
				`| ${cell(model.provider)} | ${cell(model.model)} | ${compact(model.tokens)} | $${Number(model.usd).toFixed(2)} |`,
		),
		"",
		"## Token breakdown",
		"",
		`- Uncached input: ${compact(profile.tokenSplit.uncachedInput)}`,
		`- Cached input: ${compact(profile.tokenSplit.cachedInput)}`,
		`- Cache write 5m: ${compact(profile.tokenSplit.cacheWrite5m)}`,
		`- Cache write 1h: ${compact(profile.tokenSplit.cacheWrite1h)}`,
		`- Output: ${compact(profile.tokenSplit.output)}`,
		`- Reasoning output: ${compact(profile.tokenSplit.reasoningOutput)}`,
		"",
		`Published voluntarily by the account holder. Source: ${COMPANY.MARKETING_URL}/${profile.handle}`,
	);

	return lines.join("\n");
}
