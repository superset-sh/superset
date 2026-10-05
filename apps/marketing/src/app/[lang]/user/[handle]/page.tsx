import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ContributionGraph } from "@/app/[lang]/components/ContributionGraph";
import { LeaderboardBackLink } from "@/app/[lang]/components/LeaderboardBackLink";
import { LeaderboardLayout } from "@/app/[lang]/components/LeaderboardLayout";
import { LeaderboardPanel } from "@/app/[lang]/components/LeaderboardPanel";
import {
	buildModelColors,
	ModelBars,
	toTokenRows,
} from "@/app/[lang]/components/ModelBars";
import { StatStrip } from "@/app/[lang]/components/StatStrip";
import { TierObjectives } from "@/app/[lang]/components/TierObjectives";
import { TierTube } from "@/app/[lang]/components/TierTube";
import { TokenSplitBar } from "@/app/[lang]/components/TokenSplitBar";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import {
	dayCount,
	formatCount,
	formatDayRange,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";
import { initServerI18n } from "@/app/i18n-server";
import { AchievementShelf } from "./components/AchievementShelf";
import { ModelMix } from "./components/ModelMix";
import { ProfileIdentity } from "./components/ProfileIdentity";
import { ProfileUnavailable } from "./components/ProfileUnavailable";
import { ViewToggle } from "./components/ViewToggle";
import { loadProfile } from "./utils/loadProfile";

export const instant = false;

interface PageProps {
	params: Promise<{ handle: string }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const lang = await initServerI18n();
	const { handle } = await params;
	const lookup = await loadProfile(handle);

	if (lookup.state === "missing") {
		return { title: "Not found", robots: { index: false } };
	}
	if (lookup.state === "rate-limited" || lookup.state === "unavailable") {
		return { title: "Try again shortly", robots: { index: false } };
	}

	const { profile } = lookup;
	const who = profile.name ?? `@${profile.handle}`;
	const title = `${who} · #${profile.rank} on the ${COMPANY.NAME} leaderboard`;
	const description = `${formatTokens(profile.allTime.tokens, lang)} tokens and ${formatUsd(
		profile.allTime.usd,
		lang,
	)} of API-equivalent agent usage across ${formatCount(
		profile.models.length,
		lang,
	)} models.`;
	const url = localeUrl(lang, `/${profile.handle}`);

	return {
		title,
		description,
		alternates: localizedAlternates(lang, `/${profile.handle}`),

		openGraph: {
			title,
			description,
			url,
			siteName: COMPANY.NAME,
			type: "profile",
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
		},
	};
}

export default async function UserProfilePage({ params }: PageProps) {
	await connection();
	const locale = await initServerI18n();

	const { t } = useLingui();
	const { handle } = await params;
	const lookup = await loadProfile(handle);

	if (lookup.state === "missing") notFound();
	if (lookup.state === "rate-limited" || lookup.state === "unavailable") {
		return <ProfileUnavailable rateLimited={lookup.state === "rate-limited"} />;
	}

	const { profile } = lookup;
	const colors = buildModelColors([profile.models]);
	const shareUrl = `${COMPANY.MARKETING_URL.replace(/\/$/, "")}/${profile.handle}`;
	const company = COMPANY.NAME;
	const profileHandle = profile.handle;
	const rank = profile.rank;
	const total = profile.total;
	const tokens = formatTokens(profile.allTime.tokens, locale);
	const days = profile.dayRange ? dayCount(profile.dayRange) : 0;
	const shareText = t({
		message: `I'm #${rank} on the ${company} leaderboard with ${tokens} tokens of agent usage.`,
	});

	const tier = profile.factory?.tier ?? 0;

	return (
		<LeaderboardLayout wide>
			<div className="flex flex-wrap items-center justify-between gap-3 mb-6">
				<LeaderboardBackLink />
				<ViewToggle handle={profileHandle} />
			</div>

			<div className="grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
				<ProfileIdentity
					profile={profile}
					shareUrl={shareUrl}
					shareText={shareText}
				/>
				<div className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
					<TierTube
						subject="you"
						position={
							profile.factory
								? profile.factory.tier + Math.min(0.9, profile.factory.progress)
								: 0
						}
						footer={
							<>
								<TierObjectives tier={tier} axes={profile.axes} />
								<Link
									href="/the-production-run"
									className="inline-flex min-h-11 items-center px-5 pb-2 text-xs text-muted-foreground transition-colors hover:text-brand"
								>
									<Trans>How tiers work →</Trans>
								</Link>
							</>
						}
					/>

					<StatStrip
						stats={[
							{
								label: t({
									message: "Tokens",
								}),
								value: tokens,
								hint: t({
									message: "all time",
								}),
							},
							{
								label: t({
									message: "Cost",
								}),
								value: formatUsd(profile.allTime.usd, locale),
								hint: t({
									message: "API-equivalent",
								}),
							},
							{
								label: t({
									message: "Rank",
								}),
								value: `#${rank}`,
								hint: t({
									message: `of ${total}`,
								}),
							},
							{
								label: t({
									message: "Tracking",
								}),

								value: profile.dayRange
									? t({
											message: `${days}d`,
										})
									: "—",
								hint: profile.dayRange
									? formatDayRange(profile.dayRange, locale)
									: undefined,
							},
						]}
					/>

					<LeaderboardPanel title={<Trans>Contributions</Trans>}>
						<ContributionGraph
							daily={profile.daily}
							endDay={new Date().toISOString().slice(0, 10)}
							rgb="210,86,17"
						/>
					</LeaderboardPanel>

					<LeaderboardPanel
						title={<Trans>Models</Trans>}
						meta={t({ message: "All time" })}
					>
						<ModelMix models={profile.models} locale={locale} />
						<ModelBars
							rows={toTokenRows(profile.models, locale)}
							colors={colors}
						/>
					</LeaderboardPanel>

					<LeaderboardPanel title={<Trans>Token breakdown</Trans>}>
						<TokenSplitBar split={profile.tokenSplit} />
					</LeaderboardPanel>
				</div>
				<aside className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
					<AchievementShelf awards={profile.awards} />
				</aside>
			</div>
		</LeaderboardLayout>
	);
}
