import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import type { Metadata } from "next";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { AboutSection } from "./components/AboutSection";
import { BrandAssetsSection } from "./components/BrandAssetsSection";
import { LatestNewsSection } from "./components/LatestNewsSection";
import { PressContactSection } from "./components/PressContactSection";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Media kit" })),
		description: i18n._(
			msg({
				message:
					"Company boilerplate, latest news, brand assets, and press contact for Superset.",
			}),
		),
		alternates: localizedAlternates(lang, "/media"),
		robots: { index: false, follow: false },
	};
}

export default async function MediaPage() {
	const lang = await initServerI18n();
	return (
		<main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 sm:py-20">
			<header>
				<p className="font-mono text-brand text-xs uppercase tracking-wider">
					<Trans>Media kit</Trans>
				</p>
				<h1 className="mt-4 font-medium text-4xl text-foreground tracking-tight sm:text-5xl">
					<Trans>Superset for press</Trans>
				</h1>
				<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
					<Trans>
						Everything you need to write about Superset: our company
						description, latest news, logos, product images, and who to contact.
					</Trans>
				</p>
			</header>
			<div className="mt-14 space-y-16 sm:mt-20 sm:space-y-20">
				<AboutSection />
				<LatestNewsSection lang={lang} />
				<BrandAssetsSection />
				<PressContactSection />
			</div>
		</main>
	);
}
