import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import { FactoryBackdrop } from "@/app/[lang]/components/FactoryBackdrop";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { fetchParticipant } from "@/app/[lang]/utils/fetchLeaderboard";
import { initServerI18n } from "@/app/i18n-server";
import { FightArena } from "./components/FightArena";
import { HOUSE_FIGHTERS } from "./constants";
import type { Fighter } from "./utils/simulateFight";
import { fromParticipant } from "./utils/toFighter";

const pixel = Silkscreen({
	weight: ["400", "700"],
	subsets: ["latin"],
	display: "swap",
});

export const revalidate = 300;

interface PageProps {
	searchParams: Promise<{ a?: string; b?: string }>;
}

async function resolveMatchup(
	a?: string,
	b?: string,
): Promise<[Fighter | null, Fighter | null]> {
	const [left, right] = await Promise.all([
		resolveFighter(a),
		resolveFighter(b),
	]);
	if (left && right && left.handle === right.handle) return [left, null];
	return [left, right];
}

async function resolveFighter(handle?: string): Promise<Fighter | null> {
	if (!handle) return null;
	const normalized = handle.trim().toLowerCase();

	const house = HOUSE_FIGHTERS.find((entry) => entry.handle === normalized);
	if (house) return house;

	const profile = await fetchParticipant(normalized, { period: "30d" });
	return profile ? fromParticipant(profile) : null;
}

export async function generateMetadata({
	searchParams,
}: PageProps): Promise<Metadata> {
	const lang = await initServerI18n();
	const { a, b } = await searchParams;
	const [left, right] = await resolveMatchup(a, b);

	const title =
		left && right
			? i18n._(
					msg({
						message: `${left.name} vs ${right.name}`,
					}),
				)
			: i18n._(msg({ message: "Super Fights" }));
	const description =
		left && right
			? i18n._(
					msg({
						message: `${left.name} and ${right.name} settle it as terminal dinosaurs. Stats decide the winner.`,
					}),
				)
			: i18n._(
					msg({
						message:
							"Pick two developers, watch their agent usage stats fight it out as terminal dinosaurs. Same two handles always produce the same fight.",
					}),
				);

	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/fight"),
		openGraph: {
			title: `${title} | ${COMPANY.NAME}`,
			description,
			url: localeUrl(lang, "/fight"),
			siteName: COMPANY.NAME,
		},
		twitter: {
			card: "summary_large_image",
			title: `${title} | ${COMPANY.NAME}`,
			description,
		},
	};
}

export default async function FightPage({ searchParams }: PageProps) {
	await initServerI18n();
	const { a, b } = await searchParams;
	const [left, right] = await resolveMatchup(a, b);

	return (
		<main className="relative min-h-screen">
			<FactoryBackdrop />

			<div className="relative max-w-4xl mx-auto px-6 py-10 md:py-14">
				<header className="text-center pt-6 md:pt-10 mb-10 md:mb-14">
					<h1
						className={`${pixel.className} text-3xl md:text-4xl text-foreground`}
					>
						<Trans>Super Fights</Trans>
					</h1>
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground mt-5">
						<Trans>Your stats, settled in combat</Trans>
					</p>
				</header>

				<FightArena initialA={left} initialB={right} />
			</div>
		</main>
	);
}
