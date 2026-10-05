import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { LeaderboardBackLink } from "@/app/[lang]/components/LeaderboardBackLink";
import { LeaderboardHeader } from "@/app/[lang]/components/LeaderboardHeader";
import { LeaderboardLayout } from "@/app/[lang]/components/LeaderboardLayout";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { fetchParticipant } from "@/app/[lang]/utils/fetchLeaderboard";
import { initServerI18n } from "@/app/i18n-server";
import { FightArena } from "./components/FightArena";
import { FightWordmark } from "./components/FightWordmark";
import { HOUSE_FIGHTERS } from "./constants";
import type { Fighter } from "./utils/simulateFight";
import { fromParticipant } from "./utils/toFighter";

export const instant = false;

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

async function loadParticipant(handle: string) {
	"use cache";
	cacheLife({ revalidate: 300 });
	return fetchParticipant(handle, { period: "30d" });
}

async function resolveFighter(handle?: string): Promise<Fighter | null> {
	if (!handle) return null;
	const normalized = handle.trim().toLowerCase();

	const house = HOUSE_FIGHTERS.find((entry) => entry.handle === normalized);
	if (house) return house;

	const profile = await loadParticipant(normalized);
	return profile ? fromParticipant(profile) : null;
}

export async function generateMetadata({
	searchParams,
}: PageProps): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
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
	const description = i18n._(
		msg({ message: "Your stats, settled in mortal combat" }),
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
		<LeaderboardLayout>
			<div className="mb-6">
				<LeaderboardHeader
					title={<FightWordmark />}
					description={<Trans>Your stats, settled in mortal combat</Trans>}
					navigation={<LeaderboardBackLink />}
				/>
			</div>

			<FightArena initialA={left} initialB={right} />
		</LeaderboardLayout>
	);
}
