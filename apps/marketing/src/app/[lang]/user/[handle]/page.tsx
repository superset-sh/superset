import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContributionGraph } from "@/app/[lang]/components/ContributionGraph";
import { FactoryBackdrop } from "@/app/[lang]/components/FactoryBackdrop";
import {
	buildModelColors,
	ModelBars,
	toTokenRows,
} from "@/app/[lang]/components/ModelBars";
import { StatStrip } from "@/app/[lang]/components/StatStrip";
import { tierRgb } from "@/app/[lang]/components/TierBadge";
import { TierIcon } from "@/app/[lang]/components/TierIcon";
import { TierObjectives } from "@/app/[lang]/components/TierObjectives";
import { TierTube } from "@/app/[lang]/components/TierTube";
import { TokenSplitBar } from "@/app/[lang]/components/TokenSplitBar";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { avatarUrl } from "@/app/[lang]/utils/avatarUrl";
import { fetchParticipant } from "@/app/[lang]/utils/fetchLeaderboard";
import {
	dayCount,
	formatCount,
	formatDayRange,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";
import { initServerI18n } from "@/app/i18n-server";
import { AchievementShelf } from "./components/AchievementShelf";
import { ProfileLinks } from "./components/ProfileLinks";
import { ShareButtons } from "./components/ShareButtons";
import { ViewToggle } from "./components/ViewToggle";

const pixel = Silkscreen({
	weight: ["400", "700"],
	subsets: ["latin"],
	display: "swap",
});

export const revalidate = 300;

interface PageProps {
	params: Promise<{ handle: string }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const lang = await initServerI18n();
	const { handle } = await params;
	const profile = await fetchParticipant(handle, { period: "all" });

	if (!profile) {
		return { title: "Not found", robots: { index: false } };
	}

	const who = profile.name ?? `@${profile.handle}`;
	const title = `${who} · #${profile.rank} on the ${COMPANY.NAME} leaderboard`;
	const description = `${formatTokens(profile.allTime.tokens)} tokens and ${formatUsd(
		profile.allTime.usd,
	)} of API-equivalent agent usage across ${formatCount(
		profile.models.length,
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
	await initServerI18n();

	const { t } = useLingui();
	const { handle } = await params;
	const profile = await fetchParticipant(handle, { period: "all" });

	if (!profile) notFound();

	const colors = buildModelColors([profile.models]);
	const shareUrl = `${COMPANY.MARKETING_URL.replace(/\/$/, "")}/${profile.handle}`;
	const company = COMPANY.NAME;
	const profileHandle = profile.handle;
	const rank = profile.rank;
	const total = profile.total;
	const tokens = formatTokens(profile.allTime.tokens);
	const days = profile.dayRange ? dayCount(profile.dayRange) : 0;
	const shareText = t({
		message: `I'm #${rank} on the ${company} leaderboard with ${tokens} tokens of agent usage.`,
	});

	const tier = profile.factory?.tier ?? 0;
	const tint = tier >= 1 ? tierRgb(tier) : undefined;

	return (
		<main className="relative min-h-screen">
			<FactoryBackdrop halfWidth={384} glow={false} grid={false} />

			<div className="relative max-w-3xl mx-auto px-6 py-10 md:py-14">
				<div className="flex justify-end mb-6">
					<ViewToggle handle={profileHandle} />
				</div>

				<header className="text-center">
					<div className="relative mx-auto w-fit">
						<Image
							src={avatarUrl(profile.handle)}
							alt=""
							width={72}
							height={72}
							unoptimized
							className="size-18 rounded-[3px] bg-foreground/[0.04]"
							style={
								tint
									? {
											boxShadow: `0 0 0 1px rgba(${tint},0.45), 0 0 28px rgba(${tint},0.22)`,
										}
									: undefined
							}
						/>
						{tier >= 1 && (
							<span
								className="absolute -bottom-2 -right-2 flex size-7 items-center justify-center border border-border bg-background"
								style={{ color: `rgb(${tint})` }}
							>
								<TierIcon tier={tier} size={18} />
							</span>
						)}
					</div>
					<h1
						className={`${pixel.className} text-2xl md:text-3xl text-foreground mt-5 leading-tight`}
					>
						{profile.name ?? profile.handle}
					</h1>
					<p className="font-mono text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground mt-2.5">
						{`@${profileHandle}`}
						<span className="mx-2 text-muted-foreground/40">·</span>
						<Link
							href="/leaderboard"
							className="hover:text-brand transition-colors"
						>
							<Trans>
								rank #{rank} of {total}
							</Trans>
						</Link>
					</p>

					{profile.bio && (
						<p className="max-w-md mx-auto text-sm text-foreground/80 leading-relaxed mt-5">
							{profile.bio}
						</p>
					)}

					<ProfileLinks
						githubHandle={profile.githubHandle}
						xHandle={profile.xHandle}
						websiteUrl={profile.websiteUrl}
					/>

					<div className="mt-7">
						<ShareButtons url={shareUrl} text={shareText} />
					</div>
				</header>

				<div className="mt-10 md:mt-12 space-y-6">
					<TierTube
						subject="you"
						position={
							profile.factory
								? profile.factory.tier + Math.min(0.9, profile.factory.progress)
								: 0
						}
						pixelClassName={pixel.className}
						footer={<TierObjectives tier={tier} axes={profile.axes} />}
					/>

					<AchievementShelf awards={profile.awards} />

					<StatStrip
						pixelClassName={pixel.className}
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
								value: formatUsd(profile.allTime.usd),
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
									? formatDayRange(profile.dayRange)
									: undefined,
							},
						]}
					/>

					<section className="border border-border p-5">
						<h2 className="font-mono text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground mb-4">
							<Trans>Contributions</Trans>
						</h2>
						<ContributionGraph
							daily={profile.daily}
							endDay={new Date().toISOString().slice(0, 10)}
							rgb="210,86,17"
						/>
					</section>

					<section className="border border-border p-5">
						<h2 className="font-mono text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground mb-4">
							<Trans>Models</Trans>
						</h2>
						<ModelBars
							rows={toTokenRows(
								profile.models.map((model) => ({ ...model, usd: model.usd })),
							)}
							colors={colors}
						/>
					</section>

					<section className="border border-border p-5">
						<h2 className="font-mono text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground mb-4">
							<Trans>Token breakdown</Trans>
						</h2>
						<TokenSplitBar split={profile.tokenSplit} />
					</section>
				</div>
			</div>
		</main>
	);
}
