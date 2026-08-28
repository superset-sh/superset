import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FactoryBackdrop } from "@/app/components/FactoryBackdrop";
import {
	buildModelColors,
	ModelBars,
	toTokenRows,
} from "@/app/components/ModelBars";
import { StatStrip } from "@/app/components/StatStrip";
import { tierRgb } from "@/app/components/TierBadge";
import { TierIcon } from "@/app/components/TierIcon";
import { TierTube } from "@/app/components/TierTube";
import { TokenSplitBar } from "@/app/components/TokenSplitBar";
import { avatarUrl } from "@/app/utils/avatarUrl";
import { fetchParticipant } from "@/app/utils/fetchLeaderboard";
import {
	dayCount,
	formatCount,
	formatDayRange,
	formatTokens,
	formatUsd,
} from "@/app/utils/formatUsage";
import { ShareButtons } from "./components/ShareButtons";

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
	const url = `/user/${profile.handle}`;

	return {
		title,
		description,
		alternates: { canonical: url },

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
	const { t } = useLingui();
	const { handle } = await params;
	const profile = await fetchParticipant(handle, { period: "all" });

	if (!profile) notFound();

	const colors = buildModelColors([profile.models]);
	const shareUrl = `${COMPANY.MARKETING_URL.replace(/\/$/, "")}/user/${profile.handle}`;
	const company = COMPANY.NAME;
	const profileHandle = profile.handle;
	const rank = profile.rank;
	const total = profile.total;
	const tokens = formatTokens(profile.allTime.tokens);
	const days = profile.dayRange ? dayCount(profile.dayRange) : 0;
	const shareText = t({
		id: "marketing.profile.shareText",
		message: `I'm #${rank} on the ${company} leaderboard with ${tokens} tokens of agent usage.`,
	});

	const tier = profile.factory?.tier ?? 0;
	const tint = tier >= 1 ? tierRgb(tier) : undefined;

	return (
		<main className="relative min-h-screen">
			<FactoryBackdrop tint={tint} halfWidth={384} />

			<div className="relative max-w-3xl mx-auto px-6 py-10 md:py-14">
				<Link
					href="/leaderboard"
					className="inline-block font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-brand transition-colors"
				>
					<Trans id="marketing.profile.backToLeaderboard">
						← Back to leaderboard
					</Trans>
				</Link>

				<header className="text-center pt-8 md:pt-10">
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
						className={`${pixel.className} text-2xl md:text-3xl text-foreground mt-5`}
					>
						{profile.name ?? profile.handle}
					</h1>
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground mt-3">
						<Trans id="marketing.profile.handleAndRank">
							@{profileHandle} · rank #{rank} of {total}
						</Trans>
					</p>

					<div className="mt-7">
						<ShareButtons url={shareUrl} text={shareText} />
					</div>
				</header>

				<div className="mt-10 md:mt-12 space-y-6">
					<TierTube
						subject="you"
						position={
							profile.factory
								? profile.factory.tier + profile.factory.progress
								: 0
						}
						pixelClassName={pixel.className}
					/>

					<StatStrip
						pixelClassName={pixel.className}
						stats={[
							{
								label: t({
									id: "marketing.profile.stats.tokens",
									message: "Tokens",
								}),
								value: tokens,
								hint: t({
									id: "marketing.profile.stats.tokensHint",
									message: "all time",
								}),
							},
							{
								label: t({
									id: "marketing.profile.stats.cost",
									message: "Cost",
								}),
								value: formatUsd(profile.allTime.usd),
								hint: t({
									id: "marketing.profile.stats.costHint",
									message: "API-equivalent",
								}),
							},
							{
								label: t({
									id: "marketing.profile.stats.rank",
									message: "Rank",
								}),
								value: `#${rank}`,
								hint: t({
									id: "marketing.profile.stats.rankHint",
									message: `of ${total}`,
								}),
							},
							{
								label: t({
									id: "marketing.profile.stats.tracking",
									message: "Tracking",
								}),

								value: profile.dayRange
									? t({
											id: "marketing.profile.stats.trackingDays",
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
							<Trans id="marketing.profile.models">Models</Trans>
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
							<Trans id="marketing.profile.tokenBreakdown">
								Token breakdown
							</Trans>
						</h2>
						<TokenSplitBar split={profile.tokenSplit} />
					</section>
				</div>
			</div>
		</main>
	);
}
