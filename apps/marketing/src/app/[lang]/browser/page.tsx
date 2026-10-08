import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import type { Metadata } from "next";
import { CTASection } from "@/app/[lang]/components/CTASection";
import { ProductHeroActions } from "@/app/[lang]/components/ProductHeroActions";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { AgentDrive } from "./components/AgentDrive";
import { BrowserHeroVideo } from "./components/BrowserHeroVideo";
import { HowItWorks } from "./components/HowItWorks";
import { FEATURES } from "./constants";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Superset in-app browser" })),
		description: i18n._(
			msg({
				message:
					"Preview your dev server next to your terminals. Your agent can click through it and check its own work.",
			}),
		),
		alternates: localizedAlternates(lang, "/browser"),
	};
}

export default async function BrowserPage() {
	await initServerI18n();
	const { t } = useLingui();

	return (
		<div className="overflow-x-clip">
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section>
					<div className="max-w-3xl">
						<p className="font-mono text-brand text-xs uppercase tracking-wider">
							<Trans>In-app browser</Trans>
						</p>
						<h1 className="mt-4 font-medium text-balance text-4xl text-foreground tracking-tight sm:text-5xl">
							<Trans>
								Your running app, in a browser your agents can drive.
							</Trans>
						</h1>
						<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
							<Trans>
								Preview your dev server next to your terminals. Your agent can
								click through it and check its own work.
							</Trans>
						</p>
						<ProductHeroActions source="browser" docsPath="/browser" />
					</div>
					<BrowserHeroVideo />
				</section>

				<section className="mt-24 sm:mt-32">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						<Trans>How it works</Trans>
					</p>
					<h2 className="mt-4 font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>Point at the page. Your agent makes the change.</Trans>
					</h2>
					<HowItWorks />
					<div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
						{FEATURES.map((feature) => (
							<div
								key={feature.title.id}
								className="border-border border-t pt-4"
							>
								<h3 className="font-medium text-foreground">
									{t(feature.title)}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{t(feature.description)}
								</p>
							</div>
						))}
					</div>
				</section>

				<section className="mt-24 sm:mt-32">
					<h2 className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>Hand the browser to your agent.</Trans>
					</h2>
					<p className="mt-4 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						<Trans>
							Your agent can open any page and work through it with superset
							browser commands. It uses the pane you are watching, so you see
							every step.
						</Trans>
					</p>
					<AgentDrive />
				</section>
			</main>
			<CTASection />
		</div>
	);
}
